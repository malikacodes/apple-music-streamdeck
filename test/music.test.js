import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile } from "node:fs/promises";
import { promisify } from "node:util";

// The only fake here is Music itself. run.js is swapped for a stand-in
// osascript that writes down every script it was handed and answers with
// whatever the test says Music would. Everything in music.js is real,
// and so is every other command: sips really shrinks the art.
const music = { scripts: [], answer: "" };
const realRun = promisify(execFile);
mock.module(new URL("../src/run.js", import.meta.url).href, {
  exports: {
    COMMAND_MS: 3000,
    run: async (file, args, options) => {
      if (file !== "/usr/bin/osascript") return realRun(file, args, options);
      music.scripts.push(args.at(-1));
      const answer = typeof music.answer === "function" ? await music.answer(args.at(-1)) : music.answer;
      return { stdout: `${answer}\n` };
    },
  },
});
const { parseStatus, status, setShuffle, setRepeat, setFavorite, nextRepeat, control, artwork, ART_RETRY_MS, NOT_RUNNING, search, addTo, quoted, playlists } = await import("../src/music.js");

// Music's side of an art request, the way it behaves on my Mac: it writes
// the picture's bytes to the file the script names and says "saved", or
// says "none" when the song has no art right now. A real JPEG stands in
// for the album cover.
const FIXTURE = new URL("fixtures/art.jpg", import.meta.url).pathname;
function artMusic(has) {
  return async (script) => {
    if (!script.includes("artwork")) return "";
    if (!has()) return "none";
    await copyFile(FIXTURE, script.match(/my keepArt\(data of artwork 1 of t, "([^"]+)"\)/)[1]);
    return "saved";
  };
}
const artAsks = () => music.scripts.filter((script) => script.includes("artwork")).length;

// Real lines, copied from what the status script printed on my Mac.
const PAUSED = "paused\t100\tfalse\ttrue\toff\t1\t189\t1E4696F2D8590BD3\tfalse\tFBD9055305241C1B\t2\tGet Me Some of That\tThomas Rhett\tIt Goes Like This";
const NO_ALBUM = "playing\t15\tfalse\ttrue\toff\t1\t196\t55F36365FD23B6BC\tfalse\tAAC4CDF378C965EA\t8\tBeauty In The Mundane\tBird Of Figment feat. Cody Francis\t";

// The line every key draws from. If a field lands in the wrong place,
// every key shows nonsense at once.
test("a real status line becomes the object the keys draw from", () => {
  assert.deepEqual(parseStatus(PAUSED), {
    running: true,
    state: "paused",
    playing: false,
    volume: 100,
    muted: false,
    shuffle: true,
    repeat: "off",
    position: 1,
    duration: 189,
    id: "1E4696F2D8590BD3",
    favorited: false,
    playlistId: "FBD9055305241C1B",
    index: 2,
    name: "Get Me Some of That",
    artist: "Thomas Rhett",
    album: "It Goes Like This",
  });
});

// A song with no album ends the line on a tab. That empty last field
// still counts, or the line looks one short and gets thrown away.
test("a song with an empty album still reads", () => {
  const now = parseStatus(NO_ALBUM);
  assert.equal(now.playing, true);
  assert.equal(now.artist, "Bird Of Figment feat. Cody Francis");
  assert.equal(now.album, "");
});

// Music open with nothing loaded leaves the track half off.
test("nothing loaded reads as no track, not as an error", () => {
  const now = parseStatus("stopped\t40\tfalse\tfalse\tall");
  assert.equal(now.running, true);
  assert.equal(now.id, "");
  assert.equal(now.repeat, "all");
});

// The script swaps tabs in names for spaces, so a line with an extra
// field means something went wrong. It's refused rather than read with
// every field after the tab shifted along by one.
test("a line with a stray tab in it is refused, not shifted", () => {
  const shifted = PAUSED.replace("Get Me Some", "Get Me\tSome");
  assert.throws(() => parseStatus(shifted), /15 fields/);
});

// The status script must never start Music. It's wrapped in the
// "is running" check, and Music being closed comes back as its own state.
test("Music closed reads as not running, and the script checks first", async () => {
  music.answer = "closed";
  assert.equal(await status(), NOT_RUNNING);
  const script = music.scripts.at(-1);
  assert.ok(script.indexOf('if application "Music" is running') < script.indexOf('tell application "Music"'));
});

// The tab swap is a handler, and AppleScript only allows those at the
// top of a script, outside the tell.
test("the status script puts its handler before the tell", async () => {
  music.answer = PAUSED;
  await status();
  const script = music.scripts.at(-1);
  assert.ok(script.indexOf("on clean(t)") < script.indexOf("if application"));
  assert.match(script, /my clean\(name of t\)/);
});

// Repeat goes off, all, one and round again, the same as Music's button.
// Anything strange counts as off, so the next press is "all".
test("repeat goes off, all, one, off", () => {
  assert.equal(nextRepeat("off"), "all");
  assert.equal(nextRepeat("all"), "one");
  assert.equal(nextRepeat("one"), "off");
  assert.equal(nextRepeat(undefined), "all");
});

// Each key's command, and what comes back when Music closed in the
// second since the last read: false, so the key can say "Open Music".
test("shuffle, repeat and favorite send the right command and notice Music closing", async () => {
  music.answer = "";
  assert.equal(await setShuffle(true), true);
  assert.match(music.scripts.at(-1), /set shuffle enabled to true/);
  assert.equal(await setRepeat("one"), true);
  assert.match(music.scripts.at(-1), /set song repeat to one/);
  assert.equal(await setFavorite(false), true);
  assert.match(music.scripts.at(-1), /set favorited of current track to false/);

  music.answer = "closed";
  assert.equal(await setShuffle(false), false);
  assert.equal(await control("next"), false);
});

// The settings page can only send what's in its dropdown, but a junk
// value must not end up inside a script.
test("a repeat mode that isn't one of the three becomes off", async () => {
  music.answer = "";
  await setRepeat('one" & do shell script "x');
  assert.match(music.scripts.at(-1), /set song repeat to off/);
});

// The art is asked for when the song changes, not on every one-second
// read. Asking every second would be half a megabyte a second for a
// picture that hasn't changed.
test("art is fetched once per song and handed back as a small JPEG", async () => {
  music.answer = artMusic(() => true);
  const before = artAsks();
  const first = await artwork("AAAA1111", 0);
  assert.match(first, /^data:image\/jpeg;base64,\/9j\//);
  assert.equal(await artwork("AAAA1111", 1000), first);
  assert.equal(artAsks() - before, 1);
  await artwork("BBBB2222", 2000);
  assert.equal(artAsks() - before, 2, "a new song asks again");
});

// Streamed songs sometimes have no art for a while. One more try ten
// seconds later, then the placeholder stays, so a song with no art
// doesn't cost a script every second.
test("a song with no art gets exactly one retry, ten seconds later", async () => {
  let has = false;
  music.answer = artMusic(() => has);
  const before = artAsks();
  assert.equal(await artwork("CCCC3333", 0), null);
  assert.equal(await artwork("CCCC3333", ART_RETRY_MS - 1), null);
  assert.equal(artAsks() - before, 1, "no second ask inside ten seconds");
  has = true;
  assert.match(await artwork("CCCC3333", ART_RETRY_MS), /^data:image\/jpeg/);
  assert.equal(artAsks() - before, 2);

  const after = artAsks();
  has = false;
  await artwork("DDDD4444", 0);
  await artwork("DDDD4444", ART_RETRY_MS);
  await artwork("DDDD4444", ART_RETRY_MS * 5);
  assert.equal(artAsks() - after, 2, "two tries and that's all");
});

// The song changed between the status read and the art request. That
// isn't "no art", so it mustn't use up the song's tries.
test("a song that changed mid-request isn't counted as having no art", async () => {
  music.answer = async (script) => (script.includes("artwork") ? "moved" : "");
  assert.equal(await artwork("EEEE5555", 0), null);
  music.answer = artMusic(() => true);
  assert.match(await artwork("EEEE5555", 1), /^data:image\/jpeg/);
});

// The ID goes inside a script, so anything that isn't a plain persistent
// ID is refused before Music is asked.
test("a strange persistent ID never reaches a script", async () => {
  const before = music.scripts.length;
  assert.equal(await artwork('A" & quit & "', 0), null);
  assert.equal(await artwork("", 0), null);
  assert.equal(music.scripts.length, before);
});

// Search words go inside a script in quotes. A quote or a backslash in
// them must stay text and not end the string early.
test("words with quotes in them stay inside their quotes", () => {
  assert.equal(quoted('Say "Hi"'), '"Say \\"Hi\\""');
  assert.equal(quoted("back\\slash"), '"back\\\\slash"');
});

// An empty search box asks Music nothing, and the answer's rows become
// songs, with anything that isn't a real place or ID left out.
test("search skips empty words and reads Music's rows", async () => {
  const before = music.scripts.length;
  assert.deepEqual(await search("   "), []);
  assert.equal(music.scripts.length, before);
  music.answer = "2\tEEBF76266CE98E82\tNuff Man a Come\tAction Fire\n0\tnope\tBroken\tRow";
  assert.deepEqual(await search("love"), [{ index: 2, id: "EEBF76266CE98E82", name: "Nuff Man a Come", artist: "Action Fire" }]);
  assert.match(music.scripts.at(-1), /search library playlist 1 for "love" only songs/);
});

// Adding needs a song playing and a playlist to add to. An album isn't
// somewhere a song can be added.
test("add to playlist says when nothing is playing, and refuses albums", async () => {
  music.answer = "none";
  assert.equal(await addTo({ kind: "playlist", id: "A1A1A1A1", name: "Vibes" }), "none");
  music.answer = "added";
  assert.equal(await addTo({ kind: "playlist", id: "A1A1A1A1", name: "Vibes" }), true);
  assert.match(music.scripts.at(-1), /duplicate t to \(first user playlist whose persistent ID is "A1A1A1A1"\)/);
  await assert.rejects(addTo({ kind: "album", name: "21" }));
});

// The playlist list never offers the plugin's own two playlists, so I
// can't point a key at the queue it keeps rewriting.
test("my playlists leave out Stream Deck Queue and Stream Deck Test", async () => {
  music.answer = "A1\tPop\nB2\tStream Deck Queue\nC3\tStream Deck Test\nD4\tVibes";
  assert.deepEqual((await playlists()).map((p) => p.name), ["Pop", "Vibes"]);
});

// The song's fields go onto the line together, so a song that fails
// halfway can't leave a line of a length the parser refuses.
test("the status script adds the song's fields in one go", async () => {
  music.answer = PAUSED;
  await status();
  assert.match(music.scripts.at(-1), /set fields to fields & trackPart & \{my clean\(name of t\)/);
});
