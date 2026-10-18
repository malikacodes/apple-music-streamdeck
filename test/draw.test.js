import { test } from "node:test";
import assert from "node:assert/strict";
import { drawCollection, drawFavorite, drawMultimedia, drawNotice, drawNowPlaying, drawPlayback, drawPlayPlaylist, drawQueue, drawRepeat, drawShuffle, drawStripNotice, drawVolume, fit } from "../src/draw.js";

// A tiny real JPEG, packed as a data URI, to stand in for album art.
const ART = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
const SONG = { name: "Get Me Some of That", artist: "Thomas Rhett", volume: 40, playing: true };
const LONG = { name: "Deep Sleep Music Experience: Sleeping Music, Relaxing Piano Music to Help You Sleep", artist: "Bird Of Figment feat. Cody Francis", volume: 40, playing: true };

// Every picture the plugin can draw, in every state it has.
const pictures = {
  "playback play": drawPlayback(),
  "playback pause": drawPlayback({ playing: true }),
  "playback previous": drawPlayback({ job: "previous" }),
  "playback next": drawPlayback({ job: "next" }),
  "shuffle on": drawShuffle({ on: true }),
  "shuffle off": drawShuffle(),
  "repeat off": drawRepeat(),
  "repeat all": drawRepeat({ mode: "all" }),
  "repeat one": drawRepeat({ mode: "one" }),
  "favorite on": drawFavorite({ on: true }),
  "favorite off": drawFavorite(),
  "favorite no track": drawFavorite({ track: false }),
  notice: drawNotice("Open Music"),
  "volume 0": drawVolume({ volume: 0 }),
  "volume 15": drawVolume({ volume: 15 }),
  "volume 100": drawVolume({ volume: 100 }),
  "volume muted": drawVolume({ volume: 40, muted: true }),
  "multimedia playing": drawMultimedia({ ...SONG, art: ART }),
  "multimedia paused": drawMultimedia({ ...SONG, art: ART, playing: false }),
  "multimedia no art": drawMultimedia(SONG),
  "multimedia long title": drawMultimedia(LONG),
  "multimedia track mode": drawMultimedia({ ...SONG, turns: "track", position: 60, duration: 180 }),
  "multimedia no track": drawMultimedia({}),
  "strip Music closed": drawStripNotice("Open Music"),
  "now playing": drawNowPlaying({ id: "A1", art: ART, playing: true }),
  "now playing paused": drawNowPlaying({ id: "A1", art: ART }),
  "now playing art on its way": drawNowPlaying({ id: "A1" }),
  "now playing nothing": drawNowPlaying({}),
  "play playlist unset": drawPlayPlaylist({}),
  "play playlist": drawPlayPlaylist({ name: "Pop", art: ART }),
  "play playlist playing": drawPlayPlaylist({ name: "Pop", art: ART, playing: true }),
  "play playlist long name no art": drawPlayPlaylist({ name: "Best of 90's and 2000's Praise and Worship" }),
  "collection empty": drawCollection({ items: [], empty: "No playlists" }),
  "collection one": drawCollection({ items: [{ name: "Pop", art: ART }] }),
  "collection many": drawCollection({ items: [{ name: "Oldies" }, { name: "Pop", art: ART }, { name: "Reggae" }, { name: "Vibes" }], at: 1 }),
  "queue live": drawQueue({ view: { live: true, total: 42, number: 3, next: true, track: { id: "S3", name: "Let Her Go", artist: "Passenger" } }, art: ART }),
  "queue later": drawQueue({ view: { live: true, total: 42, number: 9, next: false, track: { id: "S9", name: "Bad Day", artist: "Daniel Powter" } } }),
  "queue last": drawQueue({ view: { live: true, total: 42, last: true } }),
  "queue not mine": drawQueue({ view: { live: false }, now: { id: "A1", art: ART } }),
  "queue nothing playing": drawQueue({ view: { live: false }, now: {} }),
};

// The deck is pure black, so anything else behind a picture is a gray
// square. And the only colors are my four: black, white, the dim gray
// for "off", and pink. A dark gray sneaking in would show as a box.
test("every picture is on pure black and uses only my four colors", () => {
  for (const [name, svg] of Object.entries(pictures)) {
    assert.match(svg, /^<svg[^>]*><rect width="\d+" height="\d+" fill="#000000"\/>/, name);
    for (const color of svg.match(/#[0-9a-f]{6}/gi)) assert.ok(["#000000", "#ffffff", "#5c5c62", "#fc3c44"].includes(color.toLowerCase()), `${name} uses ${color}`);
  }
});

// A brand new key has no settings at all, and the dropdown's first
// choice has to be what it does.
test("a key with no job set is Play/Pause", () => {
  assert.equal(drawPlayback(), drawPlayback({ job: "playpause" }));
  assert.equal(drawPlayback({ job: undefined }), drawPlayback({ job: "playpause" }));
});

// Repeat has three states on a deck that only knows two, so the three
// pictures must really be different.
test("repeat draws three different pictures", () => {
  assert.equal(new Set([pictures["repeat off"], pictures["repeat all"], pictures["repeat one"]]).size, 3);
  assert.ok(pictures["repeat one"].includes(">1</text>"));
});

// On and off have to look different at a glance.
test("shuffle and favorite look different on and off", () => {
  assert.notEqual(pictures["shuffle on"], pictures["shuffle off"]);
  assert.notEqual(pictures["favorite on"], pictures["favorite off"]);
  assert.notEqual(pictures["favorite off"], pictures["favorite no track"]);
});

// A song name with & or < in it would break the picture.
test("a notice with & and < in it still makes a picture", () => {
  const svg = drawNotice("Rock & <Roll>");
  assert.ok(svg.includes("&amp;") && svg.includes("&lt;"));
  assert.ok(!svg.includes("<Roll>"));
});

// Long names are cut with an ellipsis and never wrapped, and a short
// name is left alone.
test("fit cuts a long name with an ellipsis and leaves a short one", () => {
  assert.equal(fit("Pop", 100, 14), "Pop");
  const cut = fit("Deep Sleep Music Experience: Sleeping Music", 100, 14);
  assert.ok(cut.endsWith("…") && cut.length < 20, cut);
  assert.equal(fit("", 100, 14), "");
});

// Muted has to look different from turned all the way down, or a quiet
// Mac is a mystery.
test("muted and volume 0 look different", () => {
  assert.notEqual(pictures["volume 0"], pictures["volume muted"]);
  assert.ok(pictures["volume muted"].includes(">Muted<"));
  assert.ok(pictures["volume 100"].includes(">100<"));
});

// A long song name on the strip is one line, cut with an ellipsis, so
// it can't wrap into the artist or run off the edge.
test("a long title on the strip is cut, not wrapped", () => {
  const svg = pictures["multimedia long title"];
  assert.equal((svg.match(/<text/g) ?? []).length, 2, "one line for the name and one for the artist");
  assert.ok(svg.includes("…"));
  assert.ok(!svg.includes("Help You Sleep"));
});

// The strip shows the art when there is some, an empty tile when there
// isn't, and dims the art while paused.
test("the strip's art tile shows, waits and dims", () => {
  assert.ok(pictures["multimedia playing"].includes(`href="${ART}"`));
  assert.ok(!pictures["multimedia playing"].includes('opacity="0.45"'));
  assert.ok(pictures["multimedia paused"].includes('opacity="0.45"'));
  assert.ok(!pictures["multimedia no art"].includes("<image"));
  assert.ok(pictures["multimedia no track"].includes(">No track<"));
});

// The bar shows what a turn will change: volume in pink, or how far
// into the song in white.
test("the multimedia bar follows what turning does", () => {
  assert.ok(pictures["multimedia playing"].includes('fill="#fc3c44"'));
  assert.ok(pictures["multimedia track mode"].includes('width="34.7" height="6" rx="3" fill="#ffffff"'));
});

// The strip is drawn once before Music has answered. A 0 there would
// look like the volume really is all the way down.
test("the volume strip shows no number before the first read", () => {
  assert.ok(!drawVolume({}).includes(">0<"));
});

// The XL key: art on the rounded tile, dim with a pause sign when
// paused, the empty tile while the art is on its way, and only a dim
// note with nothing loaded. And never any words.
test("the Now Playing key draws art, paused, waiting and nothing", () => {
  assert.ok(pictures["now playing"].includes(`href="${ART}"`));
  assert.ok(pictures["now playing"].includes('rx="32"'));
  assert.ok(!pictures["now playing"].includes("<circle"));
  assert.ok(pictures["now playing paused"].includes('opacity="0.45"') && pictures["now playing paused"].includes("<circle"));
  assert.ok(!pictures["now playing art on its way"].includes("<image"));
  assert.ok(!pictures["now playing nothing"].includes("<rect x="), "no tile at all");
  for (const name of ["now playing", "now playing paused", "now playing art on its way", "now playing nothing"]) assert.ok(!pictures[name].includes("<text"), name);
});

// A brand new Play Playlist key has no playlist, and says so instead of
// playing nothing. The playing one gets its pink ring.
test("Play Playlist says pick one, and rings the one playing", () => {
  assert.ok(pictures["play playlist unset"].includes(">Pick a<") && pictures["play playlist unset"].includes(">playlist<"));
  assert.ok(!pictures["play playlist"].includes('stroke="#fc3c44"'));
  assert.ok(pictures["play playlist playing"].includes('stroke="#fc3c44"'));
  assert.ok(pictures["play playlist long name no art"].includes("…"));
});

// The browsing dial: nothing to browse says so, one item is one tile,
// and many show the picked one bright with its whole name, and the
// neighbours faded.
test("Play Collection draws empty, one and many", () => {
  assert.ok(pictures["collection empty"].includes(">No playlists<"));
  assert.ok(!pictures["collection one"].includes('opacity="0.3"'));
  assert.equal((pictures["collection many"].match(/opacity="0.3"/g) ?? []).length, 2);
  assert.ok(pictures["collection many"].includes(">Pop<"));
  assert.ok(!pictures["collection many"].includes(">Oldies<"), "only the picked name is written");
});

// The Queue dial's number, and the notice when the music isn't from my
// queue: it says how to get one and shows only the current song's art.
test("the Queue strip shows 3 of 42, or how to get a queue", () => {
  assert.ok(pictures["queue live"].includes(">3 of 42<"));
  assert.ok(pictures["queue live"].includes(">Let Her Go<"));
  assert.ok(pictures["queue later"].includes(">9 of 42<"));
  assert.ok(pictures["queue last"].includes(">End of the queue<"));
  assert.ok(pictures["queue not mine"].includes(">Play from a dial<") && pictures["queue not mine"].includes(`href="${ART}"`));
  assert.ok(!pictures["queue nothing playing"].includes("<image"));
});
