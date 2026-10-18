// The only file that talks to Stream Deck. It hears presses and turns and
// sends pictures back. The drawing is in draw.js and everything that asks
// Music something is in music.js.
import streamDeck, { action, SingletonAction } from "@elgato/streamdeck";
import { drawFavorite, drawMultimedia, drawNotice, drawNowPlaying, drawPlayback, drawRepeat, drawShuffle, drawStripNotice, drawVolume } from "./draw.js";
import * as music from "./music.js";
import { poll } from "./poll.js";

// Keep this at "info". The "trace" level writes every message between the
// plugin and Stream Deck into the log file, and that includes the global
// settings, which is where a token or an API key would live.
streamDeck.logger.setLevel("info");

const STATUS_MS = 1000;
const NOTICE_MS = 2000;

// Stream Deck takes an image as a base64 "data URI", which is the whole
// picture packed into one long string.
function asImage(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// What Music said last time it was asked. Every key and dial draws from
// this one object, so eight keys still means one script a second. It's
// null until the first answer comes back, and keys draw their resting
// picture until then instead of flashing "Open Music".
let now = null;

// Every kind of key and dial, so the timer can reach all of them.
const kinds = [];

// The keys and dials of mine that are on the deck right now, each with
// the kind it belongs to. The SDK keeps "actions" up to date before it
// tells the plugin anything, so this is always the true list.
function onScreen() {
  return kinds.flatMap((kind) => [...kind.actions].map((target) => [kind, target]));
}

// Redraws everything that's showing. One key failing to draw (it left
// the page halfway through) mustn't stop the others.
async function redraw() {
  await Promise.all(
    onScreen().map(([kind, target]) => kind.render(target).catch((err) => streamDeck.logger.error(`Couldn't draw a key: ${err.message}`))),
  );
}

// The once a second read. It only runs while something of mine is on
// the deck: the first key to show up starts it, the last one to leave
// stops it.
// The art is fetched in the same turn, but on its own: a song whose
// picture won't come mustn't stop the song itself from showing. Its
// failures are logged once, the same way poll.js does it.
let reading = null;
let artFailing = false;
async function readMusic() {
  const status = await music.status();
  let art = null;
  if (status.id) {
    try {
      art = await music.artwork(status.id);
      artFailing = false;
    } catch (err) {
      if (!artFailing) streamDeck.logger.error(`Couldn't get the album art, so the keys show a plain tile: ${err.message}`);
      artFailing = true;
    }
  }
  now = { ...status, art };
  await redraw();
}
function startReading() {
  reading ??= poll(readMusic, STATUS_MS, (line) => streamDeck.logger.error(`Couldn't read Music's status, so the keys show the last one: ${line}`));
}
function stopReadingIfEmpty() {
  if (onScreen().length > 0) return;
  clearInterval(reading);
  reading = null;
}

// What every key and dial of this plugin has in common: its settings,
// the last picture it was sent, a notice that can take it over for two
// seconds, and the "Open Music" picture when Music is closed. Each kind
// only says how it draws (draw) and what a press does (press). A dial
// says strip = true, and its picture goes to the strip instead.
class MusicAction extends SingletonAction {
  strip = false;
  settings = new Map();
  shown = new Map();
  notices = new Map();

  constructor() {
    super();
    kinds.push(this);
  }

  async onWillAppear(ev) {
    this.settings.set(ev.action.id, ev.payload.settings ?? {});
    this.shown.delete(ev.action.id);
    startReading();
    await this.render(ev.action);
  }

  onWillDisappear(ev) {
    this.settings.delete(ev.action.id);
    this.shown.delete(ev.action.id);
    this.notices.delete(ev.action.id);
    stopReadingIfEmpty();
  }

  // Runs when I change something on the settings page.
  async onDidReceiveSettings(ev) {
    this.settings.set(ev.action.id, ev.payload.settings ?? {});
    await this.render(ev.action);
  }

  // Says something on this key for two seconds. The once a second
  // redraw is what takes it away again, so it needs no timer of its own.
  async notice(target, text) {
    this.notices.set(target.id, { text, until: Date.now() + NOTICE_MS });
    await this.render(target);
  }

  picture(target) {
    const say = this.strip ? drawStripNotice : drawNotice;
    const notice = this.notices.get(target.id);
    if (notice && notice.until > Date.now()) return say(notice.text);
    this.notices.delete(target.id);
    if (now && !now.running) return say("Open Music");
    return this.draw(now ?? {}, this.settings.get(target.id) ?? {});
  }

  // Only sends the picture when it changed. Most seconds nothing has,
  // and the deck doesn't need the same picture again.
  async render(target) {
    const svg = this.picture(target);
    if (this.shown.get(target.id) === svg) return;
    this.shown.set(target.id, svg);
    if (this.strip) await target.setFeedback({ canvas: asImage(svg) });
    else await target.setImage(asImage(svg));
  }

  // A press while Music is closed opens it, whatever the key is.
  // Otherwise the key does its job, and "false" back from music.js
  // means Music closed in the second since the last read.
  async act(target, job) {
    try {
      if (now && !now.running) return await music.openMusic();
      const open = await job(now ?? {}, this.settings.get(target.id) ?? {});
      if (open === false) now = music.NOT_RUNNING;
      await redraw();
    } catch (err) {
      streamDeck.logger.error(`${this.manifestId} failed: ${err.message}`);
      await target.showAlert();
    }
  }

  onKeyDown(ev) {
    return this.act(ev.action, (status, settings) => this.press(ev.action, status, settings));
  }

  // A dial's push and a tap on its strip do the same job. Inside a dial
  // stack the push belongs to the stack, so the tap is the way in there.
  onDialDown(ev) {
    return this.act(ev.action, (status, settings) => this.press(ev.action, status, settings));
  }

  onTouchTap(ev) {
    return this.act(ev.action, (status, settings) => this.press(ev.action, status, settings));
  }

  onDialRotate(ev) {
    return this.act(ev.action, (status, settings) => this.turn(ev.action, ev.payload.ticks, status, settings));
  }
}

// After a press, the keys show what the press should have done straight
// away, and the next read a second later puts it right if Music
// disagreed. Waiting for the read made every press feel slow.
function guess(change) {
  if (now?.running) now = { ...now, ...change };
}

class Playback extends MusicAction {
  draw(status, settings) {
    return drawPlayback({ job: settings.job, playing: status.playing });
  }

  async press(target, status, settings) {
    const open = await music.control(settings.job);
    if ((settings.job ?? "playpause") === "playpause") guess({ playing: !status.playing });
    return open;
  }
}

class Shuffle extends MusicAction {
  draw(status) {
    return drawShuffle({ on: status.shuffle });
  }

  async press(target, status) {
    guess({ shuffle: !status.shuffle });
    return music.setShuffle(!status.shuffle);
  }
}

class Repeat extends MusicAction {
  draw(status) {
    return drawRepeat({ mode: status.repeat });
  }

  async press(target, status) {
    const mode = music.nextRepeat(status.repeat);
    guess({ repeat: mode });
    return music.setRepeat(mode);
  }
}

class Favorite extends MusicAction {
  draw(status) {
    return drawFavorite({ on: status.favorited, track: Boolean(status.id) });
  }

  // Nothing loaded means nothing to favorite, and saying so beats a
  // press that does nothing.
  async press(target, status) {
    if (!status.id) return this.notice(target, "No track");
    guess({ favorited: !status.favorited });
    return music.setFavorite(!status.favorited);
  }
}

// The album art key for my XL. It never has words on it, so it's the
// one key that doesn't take over with "Open Music": closed just looks
// like nothing playing.
class NowPlaying extends MusicAction {
  picture(target) {
    if (now && !now.running) return drawNowPlaying({});
    return super.picture(target);
  }

  draw(status) {
    return drawNowPlaying(status);
  }

  press() {
    return true;
  }
}

// Music won't let a script set its own mute, so muting is mine: the
// volume goes to 0 and the level it was at is kept here, and the next
// push puts it back. If the volume moves away from 0 some other way
// (Music's own slider), it isn't muted any more. A read that was already
// on its way when I pushed still says the old volume, so the first two
// seconds after a mute don't count.
let mutedFrom = null;
let mutedAt = 0;
function isMuted() {
  const settled = Date.now() - mutedAt > NOTICE_MS && !sendingVolume;
  if (mutedFrom !== null && settled && now?.running && now.volume > 0) mutedFrom = null;
  return mutedFrom !== null || Boolean(now?.muted);
}

// Turning fast sends lots of small turns, each a few hundred
// milliseconds of AppleScript. So the number on the strip moves on every
// turn, but only one volume script runs at a time, and when it's done
// it sends whatever the number is by then. Nothing piles up, and the
// last turn always wins. A turn while muted starts from the level it
// was muted at, like the volume keys on my keyboard.
let wantedVolume = null;
let sendingVolume = false;
async function sendVolume(level) {
  wantedVolume = Math.max(0, Math.min(100, level));
  guess({ volume: wantedVolume });
  await redraw();
  if (sendingVolume) return true;
  sendingVolume = true;
  try {
    let sent;
    do {
      sent = wantedVolume;
      if (!(await music.setVolume(sent))) return false;
    } while (wantedVolume !== sent);
    return true;
  } finally {
    sendingVolume = false;
    wantedVolume = null;
  }
}

function turnVolume(ticks, step) {
  if (!now?.running) return true;
  const from = wantedVolume ?? mutedFrom ?? now.volume;
  mutedFrom = null;
  return sendVolume(from + ticks * step);
}

function toggleMute() {
  if (!now?.running) return true;
  if (isMuted()) {
    const back = mutedFrom ?? 50;
    mutedFrom = null;
    return sendVolume(back);
  }
  mutedFrom = now.volume;
  mutedAt = Date.now();
  return sendVolume(0);
}

// Settings arrive as text, or not at all on a dial I've never opened
// the settings of. A step that isn't one of the menu's choices is 5.
function stepOf(settings) {
  const step = Number(settings.step);
  return [1, 2, 5, 10].includes(step) ? step : 5;
}

class Volume extends MusicAction {
  strip = true;

  draw(status) {
    return drawVolume({ volume: status.volume, muted: isMuted() });
  }

  turn(target, ticks, status, settings) {
    return turnVolume(ticks, stepOf(settings));
  }

  press() {
    return toggleMute();
  }
}

class Multimedia extends MusicAction {
  strip = true;

  draw(status, settings) {
    return drawMultimedia({ ...status, muted: isMuted(), turns: settings.turns === "track" ? "track" : "volume" });
  }

  // A turn either changes the volume or skips songs, whichever the
  // settings say. A fast spin is still one song, because a spin of
  // five clicks shouldn't skip five songs by accident.
  turn(target, ticks, status, settings) {
    if (settings.turns !== "track") return turnVolume(ticks, 5);
    return music.control(ticks > 0 ? "next" : "previous");
  }

  async press(target, status) {
    guess({ playing: !status.playing });
    return music.control("playpause");
  }
}

const register = (name, Kind) => streamDeck.actions.registerAction(new (action({ UUID: `com.malikacodes.apple-music.${name}` })(Kind))());
register("playback", Playback);
register("shuffle", Shuffle);
register("repeat", Repeat);
register("favorite", Favorite);
register("volume", Volume);
register("multimedia", Multimedia);
register("nowplaying", NowPlaying);

// connect() comes after the actions are registered.
streamDeck.connect();
