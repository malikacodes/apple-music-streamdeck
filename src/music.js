// Every question I ask the Music app lives in this file, and nothing else
// in the plugin runs osascript. Each one goes through run.js, so each
// gets its three second limit.
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
