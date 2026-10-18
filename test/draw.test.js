import { test } from "node:test";
import assert from "node:assert/strict";
import { drawPlayback } from "../src/draw.js";

// The deck is pure black, so anything else is a gray square.
test("the Playback key is drawn on pure black", () => {
  for (const job of ["playpause", "previous", "next"]) {
    assert.ok(drawPlayback({ job }).includes('<rect width="144" height="144" fill="#000000"/>'));
  }
});

// A brand new key has no settings at all, and the dropdown's first
// choice has to be what it does.
test("a key with no job set is Play/Pause", () => {
  assert.equal(drawPlayback(), drawPlayback({ job: "playpause" }));
  assert.equal(drawPlayback({ job: undefined }), drawPlayback({ job: "playpause" }));
});
