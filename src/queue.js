// The queue the dials show. Music has no Up Next I can read, so the
// plugin writes what's going to play into its own playlist, "Stream
// Deck Queue", and plays that. Then the queue is simply every song
// after the one that's playing. music.js does the AppleScript; this
// file keeps track of the order.
//
// The list logic at the top has no AppleScript in it, so the tests can
// check it without Music.
import * as music from "./music.js";

// How many songs go in before the music starts, and how many go in per
// script after that. Each song costs about 20 milliseconds to copy in,
// so fifty starts the music in about a second, and eighty fits well
// inside a script's three seconds.
export const FIRST = 50;
export const CHUNK = 80;

// A fair shuffle (Fisher-Yates: walk from the end, swap each song with
// a random one at or before it). "random" is handed in so a test can
// make it predictable.
export function shuffled(list, random = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Everything after the song that's playing. "index" is that song's
// place in the queue, counting from 1 the way Music does.
export function upNext(tracks, index) {
  return tracks.slice(Math.max(0, index));
}

// Shuffles only what hasn't played yet. The song that's playing and the
// ones before it stay where they are, so pressing Shuffle never yanks
// me out of the middle of a song.
export function shuffleRest(order, index, random = Math.random) {
  return [...order.slice(0, index), ...shuffled(order.slice(index), random)];
}

// What the Queue dial shows, from the latest status and the queue's
// songs. "picked" is the persistent ID of the song I've turned to, or
// nothing. It's remembered by ID, not place, so the song moving up the
// list as the music plays doesn't move the highlight off it. If the
// picked song has played or gone, the highlight falls back to the next
// song.
//   live    the music is playing from my queue
//   number  the highlighted song's place, for "3 of 42"
//
// If Music's own shuffle got turned on while my queue plays (from
// Music's window), Music is picking songs from it in its own order and
// "next" isn't the next row any more, so that isn't shown as the queue
// either.
export function queueView(status, queue, picked) {
  if (!status?.running || !queue?.id || status.playlistId !== queue.id) return { live: false };
  if (status.shuffle) return { live: false, musicShuffle: true };
  const total = queue.tracks.length;
  const rest = upNext(queue.tracks, status.index);
  if (rest.length === 0) return { live: true, total, last: true };
  const at = rest.findIndex((track) => track.id === picked);
  const offset = at >= 0 ? at : 0;
  return { live: true, total, track: rest[offset], number: status.index + 1 + offset, next: offset === 0 };
}

// Turning the dial moves the highlight down the rest of the queue, and
// wraps around at the ends: stopping at the end meant turning all the
// way back. Hands back the newly picked persistent ID.
export function turnPick(status, queue, picked, ticks) {
  const rest = upNext(queue?.tracks ?? [], status?.index ?? 0);
  if (rest.length === 0) return null;
  const at = Math.max(0, rest.findIndex((track) => track.id === picked));
  const next = (((at + ticks) % rest.length) + rest.length) % rest.length;
  return rest[next].id;
}

// What the plugin remembers about the queue it wrote: where the songs
// came from, the order they were written in (as places in the source),
// how many of them are in the playlist so far, and whether it's a
// shuffled order. Song N of the playlist is order[N - 1].
//
// It only lives while the plugin runs. After a restart the dial still
// reads the playlist from Music, but the Shuffle key has nothing to
// reorder and falls back to Music's own shuffle.
let state = null;
let latest = null;

// Every change to the playlist waits its turn. A background chunk being
// copied in while a jump deletes songs from the top would leave the
// count wrong, so they go one after another, like a line at a till.
let line = Promise.resolve();
function inLine(job) {
  const next = line.then(job, job);
  line = next.catch(() => {});
  return next;
}

// Each new play gets a number. A fill that finds the number has changed
// stops, because the songs it was copying belong to an older queue.
let generation = 0;

export function remembered() {
  return state;
}

export function current() {
  return latest;
}

// Reads the playlist back from Music, so the dial shows what's really
// in it.
export async function refresh() {
  latest = await music.queueTracks();
  return latest;
}

// Copies in whatever of the order isn't in the playlist yet, a chunk at
// a time, while the first songs play. It tells the plugin after each
// chunk so the dial's "of 42" can catch up.
async function fillRest(gen, { log, changed }) {
  try {
    while (gen === generation && state && state.filled < state.order.length) {
      await inLine(async () => {
        if (gen !== generation) return;
        const chunk = state.order.slice(state.filled, state.filled + CHUNK);
        await music.fillQueue(state.source, chunk);
        state.filled += chunk.length;
      });
      await refresh();
      await changed?.();
    }
  } catch (err) {
    log?.(`Couldn't finish filling the queue, so it stops where it got to: ${err.message}`);
  }
}

// Plays a playlist, album or artist through the queue. With shuffle, the
// plugin shuffles the order itself. Hands back false if Music is closed
// and "empty" if there's nothing to play.
//
// The old queue's background fill is only stopped once there's really
// something new to play. Stopping it first meant an empty playlist left
// the old queue half written.
export async function start(source, { shuffle = false, log, changed } = {}) {
  return inLine(async () => {
    const natural = await music.sourceTracks(source);
    if (natural.length === 0) return "empty";
    const gen = ++generation;
    const order = shuffle ? shuffled(natural) : natural;
    // A playlist in its own order can be copied in one go. Anything else
    // goes in one song at a time, so only the first part goes in now.
    const whole = !shuffle && source.kind === "playlist";
    const id = await music.fillQueue(source, whole ? "all" : order.slice(0, FIRST), { clear: true });
    if (!id) return false;
    state = { source, natural, order, filled: whole ? order.length : Math.min(FIRST, order.length), shuffled: shuffle };
    const open = await music.playQueue();
    await refresh();
    if (state.filled < order.length) fillRest(gen, { log, changed });
    return open;
  });
}

// Plays the song at that place in the queue, and the rest still follows.
export async function jump(number) {
  return inLine(async () => {
    const open = await music.jumpInQueue(number);
    if (state && number > 1) {
      state.order.splice(0, number - 1);
      state.filled = Math.max(0, state.filled - (number - 1));
    }
    await refresh();
    return open;
  });
}

// The Shuffle key while my queue is playing. On shuffles what hasn't
// played yet. Off puts it back in the source's own order. Either way
// the songs after the current one are rewritten, so the dial keeps
// telling the truth. Hands back "unknown" when there's nothing
// remembered (the plugin restarted since the queue was written).
export async function reorder(index, on, { log, changed } = {}) {
  if (!state) return "unknown";
  const gen = ++generation;
  const done = await inLine(async () => {
    const keep = state.order.slice(0, index);
    const waiting = state.order.slice(index);
    const rest = on ? shuffled(waiting) : state.natural.filter((place) => waiting.includes(place));
    if (!(await music.clearQueueAfter(index))) return false;
    state.order = [...keep, ...rest];
    state.filled = Math.min(index, state.filled);
    state.shuffled = on;
    return true;
  });
  if (done) {
    await refresh();
    fillRest(gen, { log, changed });
  }
  return done;
}
