import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deckChoices, whereToOpen } from "../src/decks.js";

const xl = { id: "xl-1", type: 2, isConnected: true };
const plus = { id: "plus-1", type: 7, isConnected: true };

// The reason the key exists: it sits on my XL and opens the page on my
// +. A key I've never opened the settings of has to do that too.
test("the art key on my XL opens the page on my +, set or not", () => {
  const page = { deck: "plus-1", profile: "profiles/apple-music-plus" };
  assert.deepEqual(whereToOpen("7", xl, [xl, plus]), page);
  assert.deepEqual(whereToOpen(undefined, xl, [xl, plus]), page);
  assert.deepEqual(whereToOpen("banana", xl, [xl, plus]), page);
});

// An unplugged + can't be switched. That's the yellow triangle, not a
// switch on the wrong deck.
test("with the + unplugged there's nowhere to open it", () => {
  assert.equal(whereToOpen("7", xl, [xl, { ...plus, isConnected: false }]), null);
  assert.equal(whereToOpen("7", xl, [xl]), null);
});

// A key dragged onto the + itself opens the page right there.
test("a key on the + opens the page on that same +", () => {
  assert.deepEqual(whereToOpen("7", plus, [xl, plus, { ...plus, id: "plus-2" }]).deck, "plus-1");
});

// The menu only offers decks a press could really switch right now.
test("the menu lists only plugged-in decks that have a page", () => {
  assert.deepEqual(deckChoices([xl, plus, { ...plus, id: "plus-2" }]), [{ value: "7", label: "Stream Deck +" }]);
  assert.deepEqual(deckChoices([xl]), []);
});

// The page name has to be one the manifest really lists, or the switch
// goes nowhere.
test("the page the key opens is the one the manifest ships", () => {
  const manifest = JSON.parse(readFileSync(new URL("../com.malikacodes.apple-music.sdPlugin/manifest.json", import.meta.url), "utf8"));
  const { profile } = whereToOpen("7", xl, [xl, plus]);
  assert.ok(manifest.Profiles.some((p) => p.Name === profile && p.DeviceType === 7));
});
