import { test } from "node:test";
import assert from "node:assert/strict";
import { queueView, shuffleRest, shuffled, turnPick, upNext } from "../src/queue.js";

// A made-up queue of 42 songs, and statuses the way music.js reads them.
const QUEUE_ID = "FBD9055305241C1B";
const songs = (n) => Array.from({ length: n }, (_, i) => ({ id: `S${i + 1}`, name: `Song ${i + 1}`, artist: "Someone" }));
const queue = { id: QUEUE_ID, tracks: songs(42) };
const playing = (index, playlistId = QUEUE_ID) => ({ running: true, playing: true, playlistId, index });

// A random that always says the same things, so a shuffle can be checked.
const steady = () => {
  let n = 0;
  return () => [0.9, 0.1, 0.5, 0.3, 0.7][n++ % 5];
};

// "What's next" is everything after the song that's playing, in order.
test("up next is every song after the current one", () => {
  assert.deepEqual(upNext([1, 2, 3, 4], 2), [3, 4]);
  assert.deepEqual(upNext([1, 2, 3, 4], 4), []);
  assert.deepEqual(upNext([], 0), []);
});

// Shuffle on mid-queue must not touch the song that's playing or the
// ones before it, or the music would jump the moment I press it.
test("shuffling the rest leaves the played part alone", () => {
  const order = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = shuffleRest(order, 3, steady());
  assert.deepEqual(out.slice(0, 3), [1, 2, 3]);
  assert.deepEqual([...out.slice(3)].sort(), [4, 5, 6, 7, 8]);
  assert.notDeepEqual(out.slice(3), [4, 5, 6, 7, 8]);
});

// A shuffle can't lose or repeat a song, including the small cases.
test("a shuffle keeps every song exactly once", () => {
  assert.deepEqual(shuffled([]), []);
  assert.deepEqual(shuffled([7]), [7]);
  const big = Array.from({ length: 404 }, (_, i) => i + 1);
  assert.deepEqual([...shuffled(big)].sort((a, b) => a - b), big);
});

// The number in the corner. Playing song 2 of 42, the next one up is
// song 3, so the strip says "3 of 42".
test("the Queue dial shows 3 of 42 for the song after the second", () => {
  const view = queueView(playing(2), queue);
  assert.equal(view.live, true);
  assert.equal(view.number, 3);
  assert.equal(view.total, 42);
  assert.equal(view.track.name, "Song 3");
  assert.equal(view.next, true);
});

// The highlight is remembered by song, not by place, so it stays on the
// same song as the music moves on, and falls back to the next song once
// that one has played.
test("the highlight follows its song and falls back when it has played", () => {
  assert.equal(queueView(playing(2), queue, "S10").number, 10);
  assert.equal(queueView(playing(5), queue, "S10").number, 10);
  assert.equal(queueView(playing(12), queue, "S10").number, 13);
});

// Music playing from anywhere else (Music's own window, a catalogue
// stream) isn't my queue, and the dial says so instead of guessing.
test("music that didn't come from my queue isn't shown as the queue", () => {
  assert.equal(queueView(playing(2, "40CBB8B373F96E88"), queue).live, false);
  assert.equal(queueView(playing(2, ""), queue).live, false);
  assert.equal(queueView({ running: false }, queue).live, false);
  assert.equal(queueView(playing(2), null).live, false);
});

// A queue of one, playing its only song, has nothing next. An empty
// queue the same.
test("a queue of one and an empty queue have nothing next", () => {
  assert.deepEqual(queueView(playing(1), { id: QUEUE_ID, tracks: songs(1) }), { live: true, total: 1, last: true });
  assert.equal(queueView(playing(0), { id: QUEUE_ID, tracks: [] }).last, true);
});

// Turning past the end comes back round to the next song, and turning
// left from the next song goes to the last one.
test("turning wraps around the rest of the queue", () => {
  const short = { id: QUEUE_ID, tracks: songs(5) };
  assert.equal(turnPick(playing(2), short, undefined, 1), "S4");
  assert.equal(turnPick(playing(2), short, "S5", 1), "S3");
  assert.equal(turnPick(playing(2), short, "S3", -1), "S5");
  assert.equal(turnPick(playing(5), short, undefined, 1), null);
});

// Music's own shuffle plays my queue in its own order, so the rows
// aren't what plays next. The dial says so instead of showing them.
test("Music's own shuffle on means the queue isn't shown", () => {
  const view = queueView({ ...playing(2), shuffle: true }, queue);
  assert.deepEqual(view, { live: false, musicShuffle: true });
});
