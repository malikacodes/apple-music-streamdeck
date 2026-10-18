// The only file that talks to Stream Deck. It hears presses and turns and
// sends pictures back. The drawing is in draw.js and everything that asks
// Music something is in music.js.
import streamDeck, { action, SingletonAction } from "@elgato/streamdeck";
import { drawFavorite, drawNotice, drawPlayback, drawRepeat, drawShuffle } from "./draw.js";
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
let reading = null;
async function readMusic() {
  now = await music.status();
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
// only says how it draws (draw) and what a press does (press).
class MusicAction extends SingletonAction {
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
    const notice = this.notices.get(target.id);
    if (notice && notice.until > Date.now()) return drawNotice(notice.text);
    this.notices.delete(target.id);
    if (now && !now.running) return drawNotice("Open Music");
    return this.draw(now ?? {}, this.settings.get(target.id) ?? {});
  }

  // Only sends the picture when it changed. Most seconds nothing has,
  // and the deck doesn't need the same picture again.
  async render(target) {
    const svg = this.picture(target);
    if (this.shown.get(target.id) === svg) return;
    this.shown.set(target.id, svg);
    await target.setImage(asImage(svg));
  }

  // A press while Music is closed opens it, whatever the key is.
  // Otherwise the key does its job, and "false" back from music.js
  // means Music closed in the second since the last read.
  async onKeyDown(ev) {
    try {
      if (now && !now.running) return await music.openMusic();
      const open = await this.press(ev.action, now ?? {}, this.settings.get(ev.action.id) ?? {});
      if (open === false) now = music.NOT_RUNNING;
      await redraw();
    } catch (err) {
      streamDeck.logger.error(`${this.manifestId} press failed: ${err.message}`);
      await ev.action.showAlert();
    }
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

const register = (name, Kind) => streamDeck.actions.registerAction(new (action({ UUID: `com.malikacodes.apple-music.${name}` })(Kind))());
register("playback", Playback);
register("shuffle", Shuffle);
register("repeat", Repeat);
register("favorite", Favorite);

// connect() comes after the actions are registered.
streamDeck.connect();
