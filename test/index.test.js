import { test, mock } from "node:test";
import assert from "node:assert/strict";

// index.js runs here for real, with two stand-ins: a pretend Stream
// Deck SDK (the deck, its keys, profile switching), and a pretend Music
// behind run.js that answers osascript the way the real app does and
// remembers what it was told. music.js, queue.js, draw.js and poll.js
// are all the real files.
const deck = { keys: [], instances: [], switched: [], sentToPage: [], devices: [] };
const music = { running: true, state: "paused", volume: 40, shuffle: false, repeat: "off", favorited: false, opened: 0 };

class SingletonAction {
  // Like the real SDK: the keys on screen that belong to this action.
  get actions() {
    return deck.keys.filter((key) => key.manifestId === this.manifestId);
  }
}
mock.module("@elgato/streamdeck", {
  exports: {
    default: {
      logger: { setLevel() {}, error() {}, warn() {}, info() {} },
      actions: { registerAction: (it) => deck.instances.push(it) },
      get devices() {
        return deck.devices;
      },
      profiles: { switchToProfile: async (id, profile) => deck.switched.push({ id, profile }) },
      ui: { sendToPropertyInspector: async (message) => deck.sentToPage.push(message) },
      connect() {},
    },
    action: ({ UUID }) => (cls) =>
      class extends cls {
        manifestId = UUID;
      },
    SingletonAction,
  },
});

// Music's side. The status line is built the same way the real script
// builds it; commands change what Music remembers.
function answer(script) {
  if (!music.running) return "closed";
  if (script.includes("set fields to")) {
    music.reads = (music.reads ?? 0) + 1;
    return [music.state, music.volume, false, music.shuffle, music.repeat, 3, 189, "1E4696F2D8590BD3", music.favorited, "40CBB8B373F96E88", 7, "Get Me Some of That", "Thomas Rhett", "It Goes Like This"].join("\t");
  }
  if (script.includes("artwork")) return "none";
  if (script.includes("every user playlist")) return "A1A1A1A1\tPop\nB2B2B2B2\tOldies\nC3C3C3C3\tStream Deck Queue";
  if (script.includes("album artist")) return "21\tAdele\tAdele\n21\tAdele\tAdele\nPurpose\t\tJustin Bieber";
  if (script.includes("Stream Deck Queue")) return "none";
  let found;
  if ((found = script.match(/set song repeat to (\w+)/))) music.repeat = found[1];
  // A lagging Music takes the new volume but still reports the old one
  // for a while, the way the real one does mid-turn.
  if ((found = script.match(/set sound volume to (\d+)/))) {
    music.sent = Number(found[1]);
    if (!music.lagging) music.volume = music.sent;
  }
  if ((found = script.match(/set shuffle enabled to (\w+)/))) music.shuffle = found[1] === "true";
  if ((found = script.match(/set favorited of current track to (\w+)/))) music.favorited = found[1] === "true";
  return "";
}
mock.module(new URL("../src/run.js", import.meta.url).href, {
  exports: {
    COMMAND_MS: 3000,
    run: async (file, args) => {
      if (file === "/usr/bin/open") {
        music.opened++;
        return { stdout: "" };
      }
      // A test can hold a volume change in flight, the way a slow Music
      // keeps one waiting.
      if (music.hold && args.at(-1).includes("set sound volume")) await music.hold;
      return { stdout: `${answer(args.at(-1))}\n` };
    },
  },
});
await import("../src/index.js");

// Lets every promise chain in flight finish, including a status read
// that started before a press. Five rounds was sometimes one short on a
// busy Mac, and then that read's older answer landed after the press.
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((done) => setImmediate(done));
};
const kind = (name) => deck.instances.find((it) => it.manifestId === `com.malikacodes.apple-music.${name}`);
const xl = { id: "xl-1", type: 2, isConnected: true };
const plus = { id: "plus-1", type: 7, isConnected: true };

let next = 0;
async function appear(name, settings = {}, device = xl) {
  const key = { id: `key${next++}`, manifestId: `com.malikacodes.apple-music.${name}`, device, pictures: [], alerts: 0 };
  key.setImage = async (picture) => key.pictures.push(Buffer.from(picture.split(",")[1], "base64").toString());
  key.setFeedback = async ({ canvas }) => key.pictures.push(Buffer.from(canvas.split(",")[1], "base64").toString());
  key.showAlert = async () => key.alerts++;
  key.settings = settings;
  deck.keys.push(key);
  await kind(name).onWillAppear({ action: key, payload: { settings } });
  await settle();
  return key;
}
const press = async (key) => {
  await kind(key.manifestId.split(".").pop()).onKeyDown({ action: key, payload: { settings: key.settings } });
  await settle();
};
const push = async (key) => {
  await kind(key.manifestId.split(".").pop()).onDialDown({ action: key, payload: { settings: key.settings } });
  await settle();
};
// The SDK takes the key out of its list before it tells the plugin.
function leave(key) {
  deck.keys.splice(deck.keys.indexOf(key), 1);
  kind(key.manifestId.split(".").pop()).onWillDisappear({ action: key });
}
// Fake clocks for the timer and for Date, so "a second and a half
// later" takes no real time. Each test starts its clock far past the
// last one, so a turn in one test can't leave the next one inside its
// skip-the-read window.
let lastClock = 10_000_000;
function start(t, { clock } = {}) {
  lastClock += 10_000_000;
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"], now: clock ?? lastClock });
  for (const key of [...deck.keys]) leave(key);
  Object.assign(music, { running: true, state: "paused", volume: 40, shuffle: false, repeat: "off", favorited: false, opened: 0, lagging: false, sent: null, hold: null });
  deck.switched = [];
  deck.sentToPage = [];
  deck.devices = [xl, plus];
}

// The whole point of the art key: pressed on my XL, it sends my + to the
// Apple Music page, the one the plugin ships.
test("the art key switches the picked deck to the Apple Music page", async (t) => {
  start(t);
  const art = await appear("nowplaying", { openOn: "7" });
  await press(art);
  assert.deepEqual(deck.switched, [{ id: "plus-1", profile: "profiles/apple-music-plus" }]);
  assert.equal(art.alerts, 0);
  leave(art);
});

// With the + unplugged there's nothing to switch: the yellow triangle,
// and no switch on some other deck.
test("with the + missing the art key shows the alert and switches nothing", async (t) => {
  start(t);
  deck.devices = [xl];
  const art = await appear("nowplaying", { openOn: "7" });
  await press(art);
  assert.deepEqual(deck.switched, []);
  assert.equal(art.alerts, 1);
  leave(art);
});

// Repeat has three states on a deck that knows two, so the plugin does
// the counting: off, all, one, and back to off, one press each.
test("Repeat goes off, all, one, off", async (t) => {
  start(t);
  const repeat = await appear("repeat");
  const seen = [];
  for (let i = 0; i < 3; i++) {
    await press(repeat);
    seen.push(music.repeat);
  }
  assert.deepEqual(seen, ["all", "one", "off"]);
  leave(repeat);
});

// Music won't let a script mute it, so the Volume dial's push goes to 0
// and remembers the level, and the next push puts it back.
test("the Volume dial mutes to 0 and comes back to where it was", async (t) => {
  start(t);
  const volume = await appear("volume", {}, plus);
  await push(volume);
  assert.equal(music.volume, 0);
  assert.ok(volume.pictures.at(-1).includes(">Muted<"));
  await push(volume);
  assert.equal(music.volume, 40);
  assert.ok(volume.pictures.at(-1).includes(">40%<"));
  leave(volume);
});

// Music closed: every key says so, and a press opens Music instead of
// doing its job.
test("with Music closed the keys say Open Music and a press opens it", async (t) => {
  start(t);
  music.running = false;
  const shuffle = await appear("shuffle");
  assert.match(shuffle.pictures.at(-1), />Open( Music)?</);
  await press(shuffle);
  assert.equal(music.opened, 1);
  assert.equal(music.shuffle, false, "shuffle wasn't touched");
  leave(shuffle);
});

// The Play Playlist settings page asks for its dropdown and gets my
// playlists then my albums, as two groups, without the plugin's own
// queue playlist and with each album once.
test("the Play Playlist page gets playlists and albums as two groups", async (t) => {
  start(t);
  const key = await appear("playplaylist", {}, plus);
  assert.ok(key.pictures.at(-1).includes(">Pick a<"));
  await kind("playplaylist").onSendToPlugin({ action: key, payload: { event: "getPlaylists" } });
  const [sent] = deck.sentToPage;
  assert.equal(sent.event, "getPlaylists");
  assert.deepEqual(sent.items.map((group) => group.label), ["Playlists", "Albums"]);
  assert.deepEqual(sent.items[0].children.map((row) => row.label), ["Pop", "Oldies"]);
  assert.deepEqual(sent.items[1].children.map((row) => row.label), ["21, Adele", "Purpose, Justin Bieber"]);
  assert.deepEqual(JSON.parse(sent.items[0].children[0].value), { kind: "playlist", id: "A1A1A1A1", name: "Pop" });
  leave(key);
});

// The once a second read stops when the last key leaves, so the plugin
// isn't asking Music anything with nothing on the deck.
test("the status read runs once a second, and stops when the last key leaves", async (t) => {
  start(t);
  const key = await appear("favorite");
  const first = music.reads;
  t.mock.timers.tick(1000);
  await settle();
  assert.equal(music.reads, first + 1, "one read a second while the key shows");
  leave(key);
  t.mock.timers.tick(3000);
  await settle();
  assert.equal(music.reads, first + 1, "no reads after it left");
});

// A key that leaves the page while its picture is on the way makes
// setImage fail. That used to escape and, on Node 24, end the plugin.
test("a picture that can't be sent is logged, not thrown", async (t) => {
  start(t);
  const key = await appear("repeat");
  key.setImage = async () => {
    throw new Error("No such key");
  };
  music.repeat = "one";
  await assert.doesNotReject(kind("repeat").onWillAppear({ action: key, payload: { settings: {} } }));
  leave(key);
});

// Brushing a dial while Music is closed mustn't start Music. Only a
// press means "open it".
test("turning a dial with Music closed doesn't open Music", async (t) => {
  start(t);
  music.running = false;
  const volume = await appear("volume", {}, plus);
  await kind("volume").onDialRotate({ action: volume, payload: { settings: {}, ticks: 2 } });
  await settle();
  assert.equal(music.opened, 0);
  await push(volume);
  assert.equal(music.opened, 1);
  leave(volume);
});

const turn = async (key, ticks) => {
  await kind(key.manifestId.split(".").pop()).onDialRotate({ action: key, payload: { settings: key.settings, ticks } });
  await settle();
};
const shownPercent = (key) => key.pictures.at(-1).match(/>(\d+)%</)?.[1];

// The janky turn: a once-a-second read landing mid-turn with Music's
// older volume used to pull the strip's number backwards. For a second
// and a half after a turn, the turn's own number wins.
test("an older volume read during a turn doesn't move the strip's number", async (t) => {
  start(t, { clock: 1_000_000 });
  const volume = await appear("volume", {}, plus);
  music.lagging = true;
  await turn(volume, 2);
  assert.equal(music.sent, 46, "two clicks of the default 3");
  assert.equal(shownPercent(volume), "46");
  t.mock.timers.tick(1000);
  await settle();
  assert.equal(shownPercent(volume), "46", "the read still said 40, and the strip kept 46");
  await turn(volume, 1);
  assert.equal(music.sent, 49, "the next click starts from 46, not the stale 40");
  leave(volume);
});

// Once the window is over, Music's real number is trusted again, so a
// guess that was wrong gets put right.
test("after the trust window the real volume shows again", async (t) => {
  start(t, { clock: 2_000_000 });
  const volume = await appear("volume", {}, plus);
  music.lagging = true;
  await turn(volume, 1);
  assert.equal(shownPercent(volume), "43");
  t.mock.timers.tick(2000);
  await settle();
  assert.equal(shownPercent(volume), "40");
  leave(volume);
});

// A turn draws only the dials showing the volume, once. Keys stay put
// until the next read, so a fast spin can't flood the deck with pictures.
test("a turn redraws the volume dials only", async (t) => {
  start(t);
  const volume = await appear("volume", {}, plus);
  const media = await appear("multimedia", {}, plus);
  const shuffle = await appear("shuffle");
  const before = { volume: volume.pictures.length, media: media.pictures.length, shuffle: shuffle.pictures.length };
  await turn(volume, 1);
  assert.equal(volume.pictures.length, before.volume + 1);
  assert.equal(media.pictures.length, before.media + 1);
  assert.equal(shuffle.pictures.length, before.shuffle);
  for (const key of [volume, media, shuffle]) leave(key);
});

// Music answers one script at a time, so a status read landing mid-spin
// made every volume change behind it wait. While a change is in flight,
// and for the window after, the poll ticks without asking Music; after
// the window it reads again and catches up.
test("the poll skips its read while a volume change is in flight, then reads again", async (t) => {
  start(t);
  const volume = await appear("volume", {}, plus);
  let release;
  music.hold = new Promise((done) => (release = done));
  const turned = kind("volume").onDialRotate({ action: volume, payload: { settings: {}, ticks: 1 } });
  await settle();
  const before = music.reads;
  t.mock.timers.tick(1000);
  await settle();
  assert.equal(music.reads, before, "no status script while the change is in flight");
  music.hold = null;
  release();
  await turned;
  await settle();
  t.mock.timers.tick(1000);
  await settle();
  assert.equal(music.reads, before, "still none inside the window");
  t.mock.timers.tick(1000);
  await settle();
  assert.equal(music.reads, before + 1, "the first tick after the window reads again");
  leave(volume);
});

// A skipped read mustn't hide Music closing for long: the first read
// after the window sees it, and every key says Open Music again.
test("Music closing mid-turn shows up on the first read after the window", async (t) => {
  start(t);
  const volume = await appear("volume", {}, plus);
  await turn(volume, 1);
  music.running = false;
  t.mock.timers.tick(1000);
  await settle();
  assert.ok(!volume.pictures.at(-1).includes("Open Music"), "inside the window the read is skipped");
  t.mock.timers.tick(1000);
  await settle();
  assert.ok(volume.pictures.at(-1).includes("Open Music"));
  leave(volume);
});

// A fast spin is more clicks a second than Stream Deck takes pictures.
// Inside one 100 ms window the turned dial draws the first click at once
// and one more picture at the end of the window, with the last number.
// The sound isn't throttled: Music still gets the last number.
test("a burst of turns draws the first click and one picture with the final number", async (t) => {
  start(t);
  const volume = await appear("volume", {}, plus);
  let release;
  music.hold = new Promise((done) => (release = done));
  const before = volume.pictures.length;
  const turns = [];
  for (let i = 0; i < 5; i++) {
    turns.push(kind("volume").onDialRotate({ action: volume, payload: { settings: {}, ticks: 1 } }));
    await settle();
  }
  assert.equal(volume.pictures.length, before + 1, "only the first click drew inside the window");
  assert.equal(shownPercent(volume), "43");
  t.mock.timers.tick(100);
  await settle();
  assert.equal(volume.pictures.length, before + 2, "one more picture at the end of the window");
  assert.equal(shownPercent(volume), "55", "and it shows the last click");
  music.hold = null;
  release();
  await Promise.all(turns);
  await settle();
  assert.equal(music.sent, 55, "Music got the last number");
  leave(volume);
});

// Once the window has passed, the next click draws straight away again.
test("a turn after the window redraws at once", async (t) => {
  start(t);
  const volume = await appear("volume", {}, plus);
  await turn(volume, 1);
  t.mock.timers.tick(200);
  await settle();
  const before = volume.pictures.length;
  await turn(volume, 1);
  assert.ok(volume.pictures.length > before);
  assert.equal(shownPercent(volume), "46");
  leave(volume);
});

// During a spin on the Volume dial the Multimedia strip (heavy with its
// album art) stays put, and catches up once when the spin's sends are
// done.
test("the other dial waits for the end of the spin, then catches up once", async (t) => {
  start(t);
  const volume = await appear("volume", {}, plus);
  const media = await appear("multimedia", {}, plus);
  let release;
  music.hold = new Promise((done) => (release = done));
  const before = media.pictures.length;
  const turns = [];
  for (let i = 0; i < 4; i++) {
    turns.push(kind("volume").onDialRotate({ action: volume, payload: { settings: {}, ticks: 1 } }));
    await settle();
    t.mock.timers.tick(100);
    await settle();
  }
  assert.equal(media.pictures.length, before, "Multimedia didn't draw during the spin");
  music.hold = null;
  release();
  await Promise.all(turns);
  await settle();
  assert.equal(media.pictures.length, before + 1, "one catch-up picture at the end");
  leave(volume);
  leave(media);
});
