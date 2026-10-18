import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEVICES, layouts, profileFiles } from "../scripts/profiles.mjs";

const manifest = JSON.parse(readFileSync(new URL("../com.malikacodes.apple-music.sdPlugin/manifest.json", import.meta.url), "utf8"));
const page = (profile) => Object.values(profileFiles("apple-music-plus", profile, manifest)).find((file) => file.Controllers?.[0].Actions);
const withHome = layouts({ home: { profile: "11111111-2222-4333-a444-555555555555" } })["apple-music-plus"];

// A key off the edge of the deck, or two on one spot, imports with a
// key quietly missing.
test("every key and dial is on the + and no spot is used twice", () => {
  const { columns, rows, dials } = DEVICES.plus;
  const spots = new Set();
  for (const [column, row] of withHome.keys) {
    assert.ok(column >= 0 && column < columns && row >= 0 && row < rows, `a key at ${column},${row}`);
    assert.ok(!spots.has(`${column},${row}`), `${column},${row} twice`);
    spots.add(`${column},${row}`);
  }
  assert.deepEqual(withHome.dials.map(([column]) => column), [...Array(dials).keys()]);
});

// The page from the design: Previous, Play/Pause, Next, Home on top,
// Shuffle, Repeat, Favorite, Play Playlist below, and the four dials.
test("the page has the keys and dials in the places I planned", () => {
  const where = Object.fromEntries(withHome.keys.map(([c, r, name, settings]) => [`${c},${r}`, settings.job ? `${name}:${settings.job}` : name]));
  assert.deepEqual(where, {
    "0,0": "playback:previous",
    "1,0": "playback:playpause",
    "2,0": "playback:next",
    "3,0": "home",
    "0,1": "shuffle",
    "1,1": "repeat",
    "2,1": "favorite",
    "3,1": "playplaylist",
  });
  assert.deepEqual(withHome.dials.map(([, name]) => name), ["multimedia", "volume", "collection", "queue"]);
});

// The dials have to land in the dial row of the file, or the + shows
// four empty dials.
test("the dials are written as the page's Encoder actions", () => {
  const encoders = page(withHome).Controllers[1];
  assert.equal(encoders.Type, "Encoder");
  assert.deepEqual(Object.keys(encoders.Actions), ["0,0", "1,0", "2,0", "3,0"]);
  assert.equal(encoders.Actions["3,0"].UUID, "com.malikacodes.apple-music.queue");
});

// My playlists don't belong in a file, so Play Playlist arrives unset,
// and the Home key is left out when there's no Home profile to point at.
test("Play Playlist ships unset, and no Home profile means no Home key", () => {
  const playlistKey = page(withHome).Controllers[0].Actions["3,1"];
  assert.deepEqual(playlistKey.Settings, {});
  const bare = layouts({})["apple-music-plus"];
  assert.ok(!bare.keys.some(([, , name]) => name === "home"));
  assert.equal(page(bare).Controllers[0].Actions["3,0"], undefined);
});

// The Home key is Stream Deck's own Switch Profile, pointed at the deck
// it's on (an empty DeviceUUID), with the house picture and no words.
test("the Home key is a wordless Switch Profile on this deck", () => {
  const home = page(withHome).Controllers[0].Actions["3,0"];
  assert.equal(home.UUID, "com.elgato.streamdeck.profile.rotate");
  assert.equal(home.Settings.DeviceUUID, "");
  assert.equal(home.States[0].ShowTitle, false);
  assert.equal(home.States[0].Image, "Images/home.png");
});

// The manifest tells Stream Deck which deck the profile is for. If it
// disagrees with the file, the page lands on the wrong deck or nowhere.
test("the manifest lists the profile for the +", () => {
  const listed = manifest.Profiles.find((p) => p.Name === "profiles/apple-music-plus");
  assert.equal(listed.DeviceType, DEVICES.plus.type);
});
