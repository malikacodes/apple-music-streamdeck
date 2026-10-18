import { test, mock } from "node:test";
import assert from "node:assert/strict";

// The only fake here is Music itself. run.js is swapped for a stand-in
// osascript that writes down every script it was handed and answers with
// whatever the test says Music would. Everything in music.js is real.
const music = { scripts: [], answer: "" };
mock.module(new URL("../src/run.js", import.meta.url).href, {
  namedExports: {
    COMMAND_MS: 3000,
    run: async (file, args) => {
      music.scripts.push(args.at(-1));
      const answer = typeof music.answer === "function" ? music.answer(args.at(-1)) : music.answer;
      return { stdout: `${answer}\n` };
    },
  },
});
const { parseStatus, status, setShuffle, setRepeat, setFavorite, nextRepeat, control, NOT_RUNNING } = await import("../src/music.js");

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
