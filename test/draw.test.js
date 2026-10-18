import { test } from "node:test";
import assert from "node:assert/strict";
import { drawFavorite, drawNotice, drawPlayback, drawRepeat, drawShuffle, fit } from "../src/draw.js";

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
