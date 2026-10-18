import { test } from "node:test";
import assert from "node:assert/strict";
import { barColor, drawAddTo, drawAirPlay, drawCollection, drawFavorite, drawMultimedia, drawNotice, drawNowPlaying, drawPlayback, drawPlayPlaylist, drawQueue, drawRepeat, drawSearch, drawShuffle, drawStripNotice, drawVolume, fit } from "../src/draw.js";

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
  "add to unset": drawAddTo({}),
  "add to": drawAddTo({ name: "Vibes" }),
  "add to added": drawAddTo({ name: "Vibes", added: true }),
  "airplay none": drawAirPlay({ devices: [] }),
  "airplay one": drawAirPlay({ devices: [{ name: "Malika’s MacBook Pro", selected: true, kind: "computer" }] }),
  "airplay many": drawAirPlay({ devices: [{ name: "Malika’s MacBook Pro", selected: true, kind: "computer" }, { name: "Living Room", selected: false, kind: "Apple TV" }, { name: "Kitchen", selected: false, kind: "speaker" }], at: 1 }),
  "search no words": drawSearch({ words: "" }),
  "search waiting": drawSearch({ words: "love" }),
  "search nothing": drawSearch({ words: "zzzqqq", results: [] }),
  "search one": drawSearch({ words: "love", results: [{ index: 2, id: "EEBF76266CE98E82", name: "Nuff Man a Come", artist: "Action Fire" }], art: ART }),
  "search many": drawSearch({ words: "love", results: [{ id: "A", name: "One", artist: "X" }, { id: "B", name: "Two", artist: "Y" }, { id: "C", name: "Three", artist: "Z" }], at: 2 }),
};

// The deck is pure black, so anything else behind a picture is a gray
// square. And the only colors are my four (black, white, the dim gray
// for "off", and pink) plus the volume bar's dark track, the one groove
// shared with my Audio Dial. Any other dark gray would show as a box.
test("every picture is on pure black and uses only my four colors", () => {
  for (const [name, svg] of Object.entries(pictures)) {
    assert.match(svg, /^<svg[^>]*><rect width="\d+" height="\d+" fill="#000000"\/>/, name);
    for (const color of svg.match(/#[0-9a-f]{6}/gi)) assert.ok(["#000000", "#ffffff", "#5c5c62", "#f2a7c3", "#2c2c30"].includes(color.toLowerCase()), `${name} uses ${color}`);
  }
});

// White or the dim gray made see-through turns into a flat gray square
// on the deck, and the hex check above can't see that. Only album art
// may be faded.
test("nothing but album art is ever see-through", () => {
  for (const [name, svg] of Object.entries(pictures)) {
    for (const element of svg.match(/<[a-z]+[^>]*opacity="[^"]*"/g) ?? []) assert.ok(element.startsWith("<image"), `${name}: ${element.slice(0, 60)}`);
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
  assert.ok(pictures["volume 100"].includes(">100%<"));
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
  assert.ok(pictures["multimedia playing"].includes('fill="#f2a7c3"'));
  assert.ok(pictures["multimedia track mode"].includes('width="57" height="8" rx="4" fill="#ffffff"'));
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
  assert.ok(!pictures["play playlist"].includes('stroke="#f2a7c3"'));
  assert.ok(pictures["play playlist playing"].includes('stroke="#f2a7c3"'));
  assert.ok(pictures["play playlist long name no art"].includes("…"));
});

// The browsing dial: nothing to browse says so, one item is one tile,
// and many show the picked one bright with its whole name, and the
// neighbours faded.
test("Play Collection draws empty, one and many", () => {
  assert.ok(pictures["collection empty"].includes(">No playlists<"));
  assert.ok(!pictures["collection one"].includes('opacity="0.3"'));
  assert.equal((drawCollection({ items: [{ name: "A", art: ART }, { name: "B", art: ART }, { name: "C", art: ART }], at: 1 }).match(/opacity="0.3"/g) ?? []).length, 2, "the two side tiles are faded");
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

// Add to: unset says pick one, set shows the playlist, and a press gives
// a pink tick that looks nothing like the resting key.
test("Add to playlist draws unset, set and the tick", () => {
  assert.ok(pictures["add to unset"].includes(">Pick a<"));
  assert.ok(pictures["add to"].includes(">Vibes<"));
  assert.ok(pictures["add to added"].includes(">Added<"));
  assert.notEqual(pictures["add to"], pictures["add to added"]);
});

// AirPlay with nothing, one place and many. The place Music plays to
// now is pink, the highlighted one has its name written out.
test("the AirPlay strip draws none, one and many", () => {
  assert.ok(pictures["airplay none"].includes(">No AirPlay devices<"));
  assert.ok(pictures["airplay one"].includes('stroke="#f2a7c3"'));
  assert.ok(!pictures["airplay one"].includes('opacity="0.3"'));
  assert.ok(pictures["airplay many"].includes(">Living Room<"));
  // Living Room is picked, so the MacBook (playing now) sits to its left
  // in pink and the Kitchen to its right in the dim gray.
  assert.equal((pictures["airplay many"].match(/stroke="#5c5c62"/g) ?? []).length, 1);
  assert.equal((pictures["airplay many"].match(/stroke="#f2a7c3"/g) ?? []).length, 1);
});

// Saved Search's empty states each say something different, and nothing
// matching says what was searched for.
test("the Saved Search strip draws no words, waiting, nothing, one and many", () => {
  assert.ok(pictures["search no words"].includes(">Add search words<"));
  assert.ok(pictures["search waiting"].includes(">Searching<"));
  assert.ok(pictures["search nothing"].includes(">Nothing matches<") && pictures["search nothing"].includes("“zzzqqq”"));
  assert.ok(pictures["search one"].includes(">1 of 1<") && pictures["search one"].includes(">Nuff Man"));
  assert.ok(pictures["search many"].includes(">3 of 3<") && pictures["search many"].includes(">Three<"));
});

// Laid out exactly like my Audio Dial's strip, so the two dials look the
// same side by side: name, percent, and an 8px bar on its dark track.
test("the Volume strip matches my Audio Dial's layout", () => {
  const svg = drawVolume({ volume: 54 });
  assert.ok(svg.includes('<text x="14" y="30" font-size="15" font-weight="600" fill="#ffffff">Music</text>'));
  assert.ok(svg.includes('<text x="14" y="64" font-size="22" font-weight="600" fill="#ffffff">54%</text>'));
  assert.ok(svg.includes('<rect x="14" y="78" width="172" height="8" rx="4" fill="#2c2c30"/>'));
  assert.ok(svg.includes('<rect x="14" y="78" width="93" height="8" rx="4" fill="#f2a7c3"/>'));
});

// 1% is still a dot you can see, and 0% is an empty track, not a dot.
test("the bar is never thinner than 8 once there's any volume", () => {
  assert.ok(drawVolume({ volume: 1 }).includes('width="8" height="8" rx="4" fill="#f2a7c3"'));
  assert.ok(!drawVolume({ volume: 0 }).includes('fill="#f2a7c3"'));
});

// The bar color is a setting typed on the settings page. A plain hex
// is used, anything else falls back to the pink, so junk can't break
// the picture.
test("the bar color setting is used when it's a plain hex, pink otherwise", () => {
  assert.equal(barColor("#f2a7c3"), "#f2a7c3");
  assert.equal(barColor("pink"), "#f2a7c3");
  assert.equal(barColor('#fff" onload="x'), "#f2a7c3");
  assert.equal(barColor(undefined), "#f2a7c3");
  assert.ok(drawVolume({ volume: 50, color: "#f2a7c3" }).includes('fill="#f2a7c3"'));
  assert.ok(drawMultimedia({ name: "Patient", volume: 50, color: "#f2a7c3" }).includes('fill="#f2a7c3"'));
});

// One type scale for everything, taken from my Audio Dial and my
// Pomodoro key: on a strip 15 and 22 for words and values and 14 for a
// small second line, on a key 20 for its words, and nothing heavier than
// 600. Any other size or weight is a picture that drifted.
test("strips use 14, 15 and 22, keys use 20, and nothing is heavier than 600", () => {
  for (const [name, svg] of Object.entries(pictures)) {
    const allowed = svg.includes('width="144"') ? ["20"] : ["14", "15", "22"];
    for (const [, size] of svg.matchAll(/font-size="(\d+)"/g)) assert.ok(allowed.includes(size), `${name} uses size ${size}`);
    for (const [, weight] of svg.matchAll(/font-weight="(\d+)"/g)) assert.ok(Number(weight) <= 600, `${name} uses weight ${weight}`);
  }
});

// The strips put words where my Audio Dial does: the name at y=30, the
// value at y=64 and the bar at y=78, all starting at x=14.
test("the strips put the name, value and bar in the Audio Dial's places", () => {
  for (const name of ["volume 15", "queue live", "search many", "multimedia playing"]) {
    assert.match(pictures[name], /<text x="14" y="30" font-size="15" font-weight="600"/, name);
  }
  assert.match(pictures["queue live"], /<text x="14" y="64" font-size="22" font-weight="600"[^>]*>3 of 42</);
  assert.match(pictures["multimedia playing"], /<rect x="14" y="78" width="172" height="8" rx="4" fill="#2c2c30"\/>/);
});

// Repeat steps through three, so three dots along the bottom say which:
// the first lit for off, the second for all, the third for one.
test("the Repeat key's dots light up off, all, one in order", () => {
  const lit = (svg) => [...svg.matchAll(/<circle cx="(\d+)" cy="126" r="4" fill="(#[0-9a-f]+)"\/>/g)].map(([, x, fill]) => (fill === "#ffffff" ? x : null)).filter(Boolean);
  assert.deepEqual(lit(pictures["repeat off"]), ["56"]);
  assert.deepEqual(lit(pictures["repeat all"]), ["72"]);
  assert.deepEqual(lit(pictures["repeat one"]), ["88"]);
  assert.equal((pictures["repeat one"].match(/cy="126"/g) ?? []).length, 3);
});
