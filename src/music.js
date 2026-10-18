// Every question I ask the Music app lives in this file, and nothing else
// in the plugin runs osascript. Each one goes through run.js, so each
// gets its three second limit.
import { mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./run.js";

// Talking to an app by name starts it if it isn't open. I don't want
// the deck opening Music behind my back, so every script is wrapped:
// it asks the Mac whether Music is running first, and only talks to it
// if it is. "is running" doesn't start anything.
// Scripts hand back the word "closed" when Music isn't there.
export const CLOSED = "closed";

// AppleScript only lets a handler (its word for a function) live at the
// top of a script, outside any "tell", so those go first.
function guarded(body, handlers = "") {
  return [
    handlers,
    'if application "Music" is running then',
    '  tell application "Music"',
    body,
    "  end tell",
    "else",
    `  return "${CLOSED}"`,
    "end if",
  ].join("\n");
}

async function ask(body, { handlers, ...options } = {}) {
  const { stdout } = await run("/usr/bin/osascript", ["-e", guarded(body, handlers)], options);
  return stdout.replace(/\n$/, "");
}

// Opening Music is the one thing that's allowed to start it, because a
// press on "Open Music" means I asked.
export async function openMusic() {
  await run("/usr/bin/open", ["-a", "Music"]);
}

// What the Playback key's dropdown can mean, and the Music command for each.
const CONTROLS = {
  playpause: "playpause",
  previous: "previous track",
  next: "next track",
};

// Returns false when Music isn't open, so the key can say so.
export async function control(job) {
  const command = CONTROLS[job] ?? CONTROLS.playpause;
  return (await ask(`    ${command}`)) !== CLOSED;
}

// Once a second every key and dial wants to know what's playing. Eight
// keys asking on their own would be eight scripts a second, so one
// script reads everything and the plugin keeps the answer in one place.
//
// The script hands it back as one line with a tab between each field,
// in this order. The track part is left off when nothing is loaded,
// which is the only time the line is short.
const PLAYER_FIELDS = ["state", "volume", "muted", "shuffle", "repeat"];
const TRACK_FIELDS = ["position", "duration", "id", "favorited", "playlistId", "index", "name", "artist", "album"];

// A tab inside a song name would push every field after it one place
// along, and the album would turn up as the artist. So the script swaps
// tabs and line breaks in the three free text fields for spaces before
// it joins them.
const CLEAN = `
on clean(t)
  set AppleScript's text item delimiters to {tab, linefeed, return}
  set parts to text items of (t as text)
  set AppleScript's text item delimiters to " "
  set t to parts as text
  set AppleScript's text item delimiters to ""
  return t
end clean`;

// "current playlist" errors out when the song didn't start from a
// playlist, so that part has its own try, and the track still shows.
const STATUS = `
    set fields to {player state as text, sound volume, mute, shuffle enabled, song repeat as text}
    try
      set t to current track
      set fields to fields & {player position as integer, duration of t as integer, persistent ID of t, favorited of t}
      try
        set fields to fields & {persistent ID of current playlist, index of t}
      on error
        set fields to fields & {"", 0}
      end try
      set fields to fields & {my clean(name of t), my clean(artist of t), my clean(album of t)}
    end try
    set AppleScript's text item delimiters to tab
    set answer to fields as text
    set AppleScript's text item delimiters to ""
    return answer`;

// What every picture draws from when Music is closed.
export const NOT_RUNNING = Object.freeze({ running: false });

// Turns the line into the object every key reads. A line with the
// wrong number of fields is thrown back, not guessed at: a shifted
// line would draw a title in the artist's place, and a failed read only
// costs one second before the next one.
export function parseStatus(line) {
  if (line === CLOSED) return NOT_RUNNING;
  const parts = line.split("\t");
  if (parts.length !== PLAYER_FIELDS.length && parts.length !== PLAYER_FIELDS.length + TRACK_FIELDS.length) {
    throw new Error(`Music's status line had ${parts.length} fields`);
  }
  const raw = Object.fromEntries([...PLAYER_FIELDS, ...TRACK_FIELDS].map((name, i) => [name, parts[i] ?? ""]));
  return {
    running: true,
    state: raw.state,
    playing: raw.state === "playing",
    volume: Number(raw.volume) || 0,
    muted: raw.muted === "true",
    shuffle: raw.shuffle === "true",
    repeat: ["one", "all"].includes(raw.repeat) ? raw.repeat : "off",
    position: Number(raw.position) || 0,
    duration: Number(raw.duration) || 0,
    id: raw.id,
    favorited: raw.favorited === "true",
    playlistId: raw.playlistId,
    index: Number(raw.index) || 0,
    name: raw.name,
    artist: raw.artist,
    album: raw.album,
  };
}

export async function status() {
  return parseStatus(await ask(STATUS, { handlers: CLEAN }));
}

// The keys' commands. Each one returns false when Music is closed.

// Repeat goes round in the same order as the button in Music's window.
const REPEAT_ORDER = ["off", "all", "one"];
export function nextRepeat(mode) {
  const at = Math.max(0, REPEAT_ORDER.indexOf(mode));
  return REPEAT_ORDER[(at + 1) % REPEAT_ORDER.length];
}

export async function setShuffle(on) {
  return (await ask(`    set shuffle enabled to ${on === true}`)) !== CLOSED;
}

export async function setRepeat(mode) {
  const safeMode = REPEAT_ORDER.includes(mode) ? mode : "off";
  return (await ask(`    set song repeat to ${safeMode}`)) !== CLOSED;
}

// Only ever the song that's playing. "loved" is the old word for this,
// and Music errors out on it now.
export async function setFavorite(on) {
  return (await ask(`    set favorited of current track to ${on === true}`)) !== CLOSED;
}

// Music has a "mute" I can read but not set: setting it fails with
// error 9038, playing or not. So muting is done by the plugin, as
// volume 0 with the old level remembered (see index.js).
export async function setVolume(level) {
  const safeLevel = Math.round(Math.max(0, Math.min(100, Number(level) || 0)));
  return (await ask(`    set sound volume to ${safeLevel}`)) !== CLOSED;
}

// Album art. Music hands it over as the picture's raw bytes, about half
// a megabyte for a streamed song. Printed as text that's over a
// megabyte, more than Node will take from a command by default, so the
// script writes the bytes to a file instead. Then sips (it comes with
// the Mac) shrinks it to 288 pixels, twice the size of a key, so the
// picture sent to the deck is small and still sharp.
//
// It's JPEG for streamed songs, not PNG, so the type comes from the
// file's first bytes rather than being assumed.
const ART_DIR = join(tmpdir(), "com.malikacodes.apple-music");
const ART_PX = 288;

// Writing a file is the Mac's job, not Music's, so it lives in a handler
// outside the tell. It can't be called "save": inside the tell, Music
// thinks that's its own save command and the script won't even compile.
const SAVE = `
on keepArt(bytes, path)
  set f to open for access POSIX file path with write permission
  try
    set eof f to 0
    write bytes to f
  end try
  close access f
end keepArt`;

// Only digits and A to F are allowed in a persistent ID, so nothing
// else from the status line can end up inside the script.
const isId = (id) => /^[0-9A-F]{1,32}$/i.test(String(id));

// The art for one song, as a data URI, or null when Music has none.
// "moved" means the song changed between the status read and this one,
// so there's nothing to say about this song yet, and that's undefined.
async function fetchArt(id) {
  await mkdir(ART_DIR, { recursive: true });
  const full = join(ART_DIR, "art");
  const small = join(ART_DIR, "art-small");
  const answer = await ask(
    `    set t to current track
    if persistent ID of t is not "${id}" then return "moved"
    if (count artworks of t) is 0 then return "none"
    my keepArt(data of artwork 1 of t, "${full}")
    return "saved"`,
    { handlers: SAVE },
  );
  if (answer === "moved" || answer === CLOSED) return undefined;
  if (answer !== "saved") return null;
  await run("/usr/bin/sips", ["-Z", String(ART_PX), full, "--out", small]);
  const bytes = await readFile(small);
  const type = bytes[0] === 0x89 ? "png" : "jpeg";
  return `data:image/${type};base64,${bytes.toString("base64")}`;
}

// What I've already got, by persistent ID. The once a second read only
// asks Music for art when the song changes, never on every tick.
//
// The same streamed song can come back with no art one minute and art
// the next, so a song with none gets one more try ten seconds later.
// After that it keeps the placeholder: asking every second would be a
// script a second for a picture that isn't coming. The retry rides on
// the once a second read, so it needs no timer of its own.
export const ART_RETRY_MS = 10000;
const ART_KEEP = 50;
const arts = new Map();

export async function artwork(id, clock = Date.now()) {
  if (!isId(id)) return null;
  const known = arts.get(id);
  if (known?.art) return known.art;
  if (known && (known.tries >= 2 || clock - known.triedAt < ART_RETRY_MS)) return null;
  // A fetch that fails (sips choking on a strange picture) counts as a
  // try with no art, so a broken picture isn't asked for every second.
  // The error still goes up, so it lands in the log.
  let art = null;
  try {
    art = await fetchArt(id);
    if (art === undefined) return null;
  } finally {
    if (art !== undefined) arts.set(id, { art, tries: (known?.tries ?? 0) + 1, triedAt: clock });
    // Fifty songs of art is plenty. The oldest goes first.
    if (arts.size > ART_KEEP) arts.delete(arts.keys().next().value);
  }
  return art;
}
