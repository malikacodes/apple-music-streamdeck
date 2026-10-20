// Every question I ask the Music app lives in this file, and nothing else
// in the plugin runs osascript. Each one goes through run.js, so each
// gets its three second limit.
import { mkdir, readFile, rm } from "node:fs/promises";
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

// A failed script comes back from Node with the whole script in its
// message, which buries the one line that matters. So only Music's own
// words go up to the log, or a plain "took too long" when run.js gave
// up on it.
async function ask(body, { handlers, ...options } = {}) {
  try {
    const { stdout } = await run("/usr/bin/osascript", ["-e", guarded(body, handlers)], options);
    return stdout.replace(/\n$/, "");
  } catch (err) {
    if (err.killed) throw new Error("Music took longer than the time limit to answer");
    throw new Error(String(err.stderr || err.message).trim().split("\n").pop());
  }
}

// Opening Music is the one thing that's allowed to start it, because a
// press on "Open Music" means I asked. It starts hidden (-j) and stays
// behind whatever I'm working in (-g): the point of the press is that
// the deck's keys come alive after a restart, not that Music's window
// lands on my screen.
export async function openMusic() {
  await run("/usr/bin/open", ["-g", "-j", "-a", "Music"]);
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
// The song's fields are gathered on the side and added all at once, so
// a song that fails halfway (an odd stream with no name) leaves the line
// at its short length instead of one the parser has to refuse. (It's
// called trackPart because "song" is already a word Music owns.)
const STATUS = `
    set fields to {player state as text, sound volume, mute, shuffle enabled, song repeat as text}
    try
      set t to current track
      set trackPart to {player position as integer, duration of t as integer, persistent ID of t, favorited of t}
      try
        set trackPart to trackPart & {persistent ID of current playlist, index of t}
      on error
        set trackPart to trackPart & {"", 0}
      end try
      set fields to fields & trackPart & {my clean(name of t), my clean(artist of t), my clean(album of t)}
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
// "where" says which song, in AppleScript ("current track", or a track
// of a playlist). When the persistent ID is known, the script checks
// it's still the same song: "moved" means it changed between the status
// read and this one, so there's nothing to say about it yet, and that's
// undefined. A song that isn't there at all (an empty playlist has no
// first song) is the same as no art. Each fetch gets its own files, so
// a strip's tiles and the art key can fetch at the same time without
// writing over each other.
let fetches = 0;
async function fetchArt(where, id) {
  await mkdir(ART_DIR, { recursive: true });
  // The process id is in the name too: a second copy of the plugin (the
  // pretend deck next to the real one) counts from 1 as well, and the
  // two were deleting each other's pictures.
  const name = `art-${process.pid}-${++fetches}`;
  const full = join(ART_DIR, name);
  const small = join(ART_DIR, `${name}-small`);
  try {
    const answer = await ask(
      `    try
      set t to ${where}
    on error
      return "none"
    end try
    ${id ? `if persistent ID of t is not "${id}" then return "moved"` : ""}
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
  } finally {
    await rm(full, { force: true });
    await rm(small, { force: true });
  }
}

// What I've already got, by persistent ID (or by playlist, for the
// tiles). The once a second read only asks Music for art when the song
// changes, never on every tick.
//
// The same streamed song can come back with no art one minute and art
// the next, so a song with none gets one more try ten seconds later.
// After that it keeps the placeholder: asking every second would be a
// script a second for a picture that isn't coming. The retry rides on
// whatever asks next, so it needs no timer of its own.
export const ART_RETRY_MS = 10000;
const ART_KEEP = 80;
const arts = new Map();

async function cachedArt(key, where, id, clock) {
  const known = arts.get(key);
  if (known?.art) return known.art;
  if (known && (known.tries >= 2 || clock - known.triedAt < ART_RETRY_MS)) return null;
  // A fetch that fails (sips choking on a strange picture) counts as a
  // try with no art, so a broken picture isn't asked for every second.
  // The error still goes up, so it lands in the log.
  let art = null;
  try {
    art = await fetchArt(where, id);
    if (art === undefined) return null;
  } finally {
    if (art !== undefined) arts.set(key, { art, tries: (known?.tries ?? 0) + 1, triedAt: clock });
    // Eighty pictures is plenty. The oldest goes first.
    if (arts.size > ART_KEEP) arts.delete(arts.keys().next().value);
  }
  return art;
}

// The song that's playing.
export async function artwork(id, clock = Date.now()) {
  if (!isId(id)) return null;
  return cachedArt(id, "current track", id, clock);
}

// A song further down the queue, by its place in it.
export async function queueArt(number, id, clock = Date.now()) {
  if (!isId(id) || !Number.isInteger(number) || number < 1) return null;
  return cachedArt(id, `track ${number} of ${QUEUE_REF}`, id, clock);
}

// A playlist, album or artist's tile: the art of its first song.
// Playlists don't have art of their own in AppleScript.
export async function sourceArt(source, clock = Date.now()) {
  const from = sourceRef(source);
  if (!from) return null;
  return cachedArt(`${source.kind}:${source.id ?? source.name}:${source.artist ?? ""}`, `track 1 of ${from.tracks}`, null, clock);
}

// "Stream Deck Queue" is a playlist the plugin owns and refills on every
// play from a dial or a Play Playlist key. Music has no Up Next I can
// read, but it does play a playlist in order, and it says which song of
// it is playing. So the queue is this playlist, and "what's next" is
// every song after the current one. The only playlists the plugin ever
// empties are this one and "Stream Deck Test".
export const QUEUE = "Stream Deck Queue";
const QUEUE_REF = `user playlist "${QUEUE}"`;
const OWN = [QUEUE, "Stream Deck Test"];

// Text that goes inside a script in quotes, with its own quotes and
// backslashes made safe, so a playlist called Say "Hi" can't break out.
export function quoted(text) {
  return `"${String(text).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// Where a source's songs are, in AppleScript. A playlist is found by its
// persistent ID when I have one, because two playlists can share a name
// (I have two called 🙌🏽). Albums and artists come from my library.
function sourceRef(source) {
  if (source?.kind === "playlist" && isId(source.id)) return { tracks: `(first user playlist whose persistent ID is "${source.id}")`, list: true };
  if (source?.kind === "playlist" && source.name) return { tracks: `user playlist ${quoted(source.name)}`, list: true };
  if (source?.kind === "album" && source.name) return { tracks: `(every track of library playlist 1 whose album is ${quoted(source.name)})`, list: false };
  if (source?.kind === "artist" && source.name) return { tracks: `(every track of library playlist 1 whose artist is ${quoted(source.name)})`, list: false };
  return null;
}

// Rows of fields with tabs between them and a line break after each,
// built inside the script so the whole list comes back in one go.
const JOIN = `
on joined(rows)
  set AppleScript's text item delimiters to linefeed
  set out to rows as text
  set AppleScript's text item delimiters to ""
  return out
end joined`;

// Inside "tell application Music", a variable can't share a name with
// a word Music already uses. "names" and "ids" broke ("Can't get item 1
// of names"), so the lists below have odd names like pids and titles.
const rowsOf = (answer) => (answer && answer !== CLOSED ? answer.split("\n").map((row) => row.split("\t")) : []);

// My playlists, without the library itself (Music lists it as a
// playlist called "Music"), folders, or the plugin's own two. Read as
// whole lists in one go: asking each playlist on its own took almost
// three seconds for my 43.
export async function playlists() {
  const answer = await ask(
    `    set {pids, titles, kinds} to {persistent ID, name, special kind} of every user playlist
    set rows to {}
    repeat with i from 1 to count pids
      if (item i of kinds as text) is "none" then set end of rows to (item i of pids) & tab & my clean(item i of titles)
    end repeat
    return my joined(rows)`,
    { handlers: CLEAN + JOIN },
  );
  return rowsOf(answer)
    .filter(([id, name]) => id && !OWN.includes(name))
    .map(([id, name]) => ({ kind: "playlist", id, name }));
}

// The albums and artists in my library, from three whole-list reads.
// Streamed songs that are only in playlists aren't in the library, so
// they don't show up here.
async function libraryRows() {
  const answer = await ask(
    `    set {als, aas, ars} to {album, album artist, artist} of every track of library playlist 1
    set rows to {}
    repeat with i from 1 to count als
      set end of rows to my clean(item i of als) & tab & my clean(item i of aas) & tab & my clean(item i of ars)
    end repeat
    return my joined(rows)`,
    { handlers: CLEAN + JOIN },
  );
  return rowsOf(answer);
}

export async function albums() {
  const seen = new Map();
  for (const [album, albumArtist, artist] of await libraryRows()) {
    if (!album) continue;
    const by = albumArtist || artist;
    seen.set(`${album}\t${by}`, { kind: "album", name: album, artist: by });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function artists() {
  const names = new Set((await libraryRows()).map(([, , artist]) => artist).filter(Boolean));
  return [...names].sort((a, b) => a.localeCompare(b)).map((name) => ({ kind: "artist", name }));
}

// The songs a source would play, as their places in it, in the order
// they'd play. A playlist plays top to bottom. An album plays by disc
// and track number, and only the album by that artist (I have more than
// one "Greatest Hits"). An artist plays album by album.
export async function sourceTracks(source) {
  const from = sourceRef(source);
  if (!from) return [];
  if (from.list) {
    const answer = await ask(`    return count tracks of ${from.tracks}`);
    return Array.from({ length: Number(answer) || 0 }, (_, i) => i + 1);
  }
  const answer = await ask(
    `    set rows to {}
    repeat with t in ${from.tracks}
      set end of rows to ((index of t) as text) & tab & (disc number of t) & tab & (track number of t) & tab & my clean(album of t) & tab & my clean(album artist of t) & tab & my clean(artist of t)
    end repeat
    return my joined(rows)`,
    { handlers: CLEAN + JOIN },
  );
  return rowsOf(answer)
    .map(([index, disc, number, album, albumArtist, artist]) => ({ index: Number(index), disc: Number(disc) || 0, number: Number(number) || 0, album, by: albumArtist || artist }))
    .filter((t) => t.index > 0 && (source.kind !== "album" || !source.artist || t.by === source.artist))
    .sort((a, b) => a.album.localeCompare(b.album) || a.disc - b.disc || a.number - b.number)
    .map((t) => t.index);
}

// Writes songs into the queue playlist, making it the first time.
// "all" copies a whole playlist in one go, which is fast (404 songs in
// a quarter of a second). A list of places copies them one by one in
// that order, which costs about 20 milliseconds a song, so callers send
// them in chunks that fit inside the three second limit.
// Hands back the queue's persistent ID.
export async function fillQueue(source, places, { clear = false } = {}) {
  const from = sourceRef(source);
  if (!from) throw new Error("That isn't a playlist, album or artist I know how to play");
  const safePlaces = places === "all" ? "all" : places.filter((n) => Number.isInteger(n) && n > 0);
  const copy =
    safePlaces === "all"
      ? `    duplicate every track of ${from.tracks} to q`
      : `    set s to ${from.list ? from.tracks : "library playlist 1"}
    repeat with i in {${safePlaces.join(",")}}
      duplicate track i of s to q
    end repeat`;
  const answer = await ask(
    `    if not (exists ${QUEUE_REF}) then make new user playlist with properties {name:"${QUEUE}"}
    set q to ${QUEUE_REF}
    ${clear ? "delete every track of q" : ""}
${copy}
    return persistent ID of q`,
  );
  return answer === CLOSED ? null : answer;
}

// Plays the queue from its first song. Music's own shuffle goes off
// first, or it would start anywhere and play my order in its own order.
export async function playQueue() {
  return (await ask(`    set shuffle enabled to false
    play ${QUEUE_REF}`)) !== CLOSED;
}

// Jumping to a song further down: everything before it goes, and the
// queue plays again from the top. That's one script however far the
// jump. Sending "next track" over and over was the other way, and three
// of them in a row only moved Music two songs.
export async function jumpInQueue(number) {
  if (!Number.isInteger(number) || number < 1) return false;
  const drop = number > 1 ? `    delete (tracks 1 thru ${number - 1} of q)
` : "";
  return (await ask(`    set q to ${QUEUE_REF}
${drop}    set shuffle enabled to false
    play q`)) !== CLOSED;
}

// Empties the queue after the song that's playing, so a new order can
// be written in behind it.
export async function clearQueueAfter(number) {
  if (!Number.isInteger(number) || number < 0) return false;
  return (await ask(`    set q to ${QUEUE_REF}
    if (count tracks of q) > ${number} then delete (tracks ${number + 1} thru -1 of q)`)) !== CLOSED;
}

// The queue as it is now: its persistent ID and every song in it, in
// order. Null when there's no queue yet.
export async function queueTracks() {
  const answer = await ask(
    `    if not (exists ${QUEUE_REF}) then return "none"
    set q to ${QUEUE_REF}
    set rows to {persistent ID of q}
    if (count tracks of q) > 0 then
      set {pids, titles, singers} to {persistent ID, name, artist} of every track of q
      repeat with i from 1 to count pids
        set end of rows to (item i of pids) & tab & my clean(item i of titles) & tab & my clean(item i of singers)
      end repeat
    end if
    return my joined(rows)`,
    { handlers: CLEAN + JOIN },
  );
  if (answer === CLOSED || answer === "none") return null;
  const [[id], ...rest] = rowsOf(answer);
  return { id, tracks: rest.map(([trackId, name, artist]) => ({ id: trackId, name, artist })) };
}

// Adds the song that's playing to one of my playlists. Music copies it
// in at the bottom, the same as "Add to Playlist" in its menu. Hands
// back "none" when nothing is playing, false when Music is closed.
export async function addTo(source) {
  const from = sourceRef(source);
  if (!from?.list) throw new Error("Songs can only be added to a playlist");
  const answer = await ask(`    try\n      set t to current track\n    on error\n      return "none"\n    end try\n    duplicate t to ${from.tracks}\n    return "added"`);
  if (answer === CLOSED) return false;
  return answer === "added" ? true : "none";
}

// Every place Music can play to (my Mac, speakers, a TV), and which one
// it's playing to now. A handful at most, so each is asked on its own.
export async function airplayDevices() {
  const answer = await ask(
    `    set rows to {}
    repeat with d in every AirPlay device
      set end of rows to my clean(name of d) & tab & (selected of d) & tab & (kind of d as text)
    end repeat
    return my joined(rows)`,
    { handlers: CLEAN + JOIN },
  );
  return rowsOf(answer)
    .filter(([name]) => name)
    .map(([name, selected, kind]) => ({ name, selected: selected === "true", kind }));
}

// Plays to that one place only, instead of wherever it was playing.
export async function selectAirPlay(name) {
  return (await ask(`    set current AirPlay devices to {(first AirPlay device whose name is ${quoted(name)})}`)) !== CLOSED;
}

// Songs in my library that match the words, the same search as the box
// in Music's window. The catalogue isn't searchable from a script, so
// it's my library only. Forty is plenty to turn through on a dial.
const SEARCH_MAX = 40;
export async function search(words) {
  if (!String(words ?? "").trim()) return [];
  const answer = await ask(
    `    set found to search library playlist 1 for ${quoted(String(words).trim())} only songs
    set rows to {}
    repeat with i from 1 to count found
      if i > ${SEARCH_MAX} then exit repeat
      set t to item i of found
      set end of rows to (index of t as text) & tab & (persistent ID of t) & tab & my clean(name of t) & tab & my clean(artist of t)
    end repeat
    return my joined(rows)`,
    { handlers: CLEAN + JOIN },
  );
  return rowsOf(answer)
    .filter(([index, id]) => Number(index) > 0 && isId(id))
    .map(([index, id, name, artist]) => ({ index: Number(index), id, name, artist }));
}

// Plays one song from my library by its place there, after checking
// it's still the song I searched for (the library can change between
// the search and the push).
export async function playLibraryTrack(index, id) {
  if (!Number.isInteger(index) || index < 1 || !isId(id)) return false;
  const answer = await ask(`    set t to track ${index} of library playlist 1\n    if persistent ID of t is not "${id}" then return "moved"\n    play t\n    return "playing"`);
  if (answer === CLOSED) return false;
  return answer === "playing" ? true : "moved";
}

// A searched song's art, by its place in my library.
export async function libraryArt(index, id, clock = Date.now()) {
  if (!isId(id) || !Number.isInteger(index) || index < 1) return null;
  return cachedArt(id, `track ${index} of library playlist 1`, id, clock);
}
