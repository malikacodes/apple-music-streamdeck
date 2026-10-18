// The only file that talks to Stream Deck. It hears presses and turns and
// sends pictures back. The drawing is in draw.js and everything that asks
// Music something is in music.js, with the queue's bookkeeping in
// queue.js.
import streamDeck, { action, SingletonAction } from "@elgato/streamdeck";
import {
  drawAddTo,
  drawAirPlay,
  drawCollection,
  drawFavorite,
  drawMultimedia,
  drawNotice,
  drawNowPlaying,
  drawPlayback,
  drawPlayPlaylist,
  drawQueue,
  drawRepeat,
  drawSearch,
  drawShuffle,
  drawStripNotice,
  drawVolume,
} from "./draw.js";
import { deckChoices, whereToOpen } from "./decks.js";
import * as music from "./music.js";
import { poll } from "./poll.js";
import * as queue from "./queue.js";

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

// Redraws everything that's showing. render() never throws (see
// below), so one key failing can't stop the others.
async function redraw() {
  await Promise.all(onScreen().map(([kind, target]) => kind.render(target)));
}

// The once a second read. It only runs while something of mine is on
// the deck: the first key to show up starts it, the last one to leave
// stops it.
//
// The art is fetched in the same turn, but on its own: a song whose
// picture won't come mustn't stop the song itself from showing. Its
// failures are logged once, the same way poll.js does it.
//
// The queue's songs are read once when the plugin starts, in case
// there's a queue left from before, and after that only when the plugin
// changes the queue itself.
let reading = null;
let artFailing = false;
let queueRead = false;
async function readMusic() {
  // While a turn is sending, and for a moment after, the read is skipped
  // (see turning() below). The timer keeps ticking, so the first tick
  // after the turn catches up on everything, Music closing or the song
  // changing included, and fetches the art with it.
  if (turning()) return;
  const status = await music.status();
  if (!queueRead && status.running) {
    queueRead = true;
    await queue.refresh().catch((err) => streamDeck.logger.error(`Couldn't read the queue playlist: ${err.message}`));
  }
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
    return this.draw(now ?? {}, this.settings.get(target.id) ?? {}, target);
  }

  // Only sends the picture when it changed. Most seconds nothing has,
  // and the deck doesn't need the same picture again.
  //
  // A key can leave the page while its picture is on the way, and then
  // setImage fails. Stream Deck's events don't catch that for me, and on
  // Node 24 an uncaught failure ends the whole plugin, so it's caught
  // here, once, for every caller.
  async render(target) {
    try {
      const svg = this.picture(target);
      if (this.shown.get(target.id) === svg) return;
      this.shown.set(target.id, svg);
      if (this.strip) await target.setFeedback({ canvas: asImage(svg) });
      else await target.setImage(asImage(svg));
    } catch (err) {
      this.shown.delete(target.id);
      streamDeck.logger.error(`Couldn't draw a key: ${err.message}`);
    }
  }

  // A press while Music is closed opens it, whatever the key is.
  // Otherwise the key does its job, and "false" back from music.js
  // means Music closed in the second since the last read.
  //
  // A turn is different: brushing a dial shouldn't start Music, so a
  // turn while it's closed does nothing.
  //
  // A turn draws only what it changed, inside its own turn(). Fast turns
  // come many a second, and redrawing every key and dial on each one blew
  // past the ten pictures a second Stream Deck takes for the whole
  // plugin. The once a second read redraws the rest.
  async act(target, job, { opens = true, turning = false } = {}) {
    try {
      if (now && !now.running) return opens ? await music.openMusic() : undefined;
      const open = await job(now ?? {}, this.settings.get(target.id) ?? {});
      if (open === false) now = music.NOT_RUNNING;
      if (open === false || !turning) await redraw();
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
    return this.act(ev.action, (status, settings) => this.turn(ev.action, ev.payload.ticks, status, settings), { opens: false, turning: true });
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

// Whether a play from my keys and dials should be shuffled. When my
// queue is playing, Music's own shuffle is off (the plugin turned it
// off so Music plays my order), and the queue's own shuffle is the one
// that counts.
function queueLive() {
  return queue.queueView(now, queue.current()).live === true;
}
function shuffling() {
  if (queueLive() && queue.remembered()) return queue.remembered().shuffled;
  return Boolean(now?.shuffle);
}

// Tells the keys and dials when a background chunk of the queue lands.
const queueEvents = {
  log: (line) => streamDeck.logger.error(line),
  changed: () => redraw(),
};

class Shuffle extends MusicAction {
  draw() {
    return drawShuffle({ on: shuffling() });
  }

  // While my queue plays, Music's shuffle would play my list in its own
  // order and the Queue dial would be wrong. So the key reorders the
  // songs that haven't played yet instead. Anywhere else, it's Music's
  // own shuffle.
  async press(target, status) {
    if (queueLive() && queue.remembered()) {
      const on = !queue.remembered().shuffled;
      return queue.reorder(status.index, on, queueEvents);
    }
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

  // A press sends my + to the Apple Music page, whatever Music is doing,
  // so it skips the "Open Music" rule the other keys follow. A plugin
  // can only open pages it ships with, which is why it's always this
  // page. The first press ever only installs it (Stream Deck asks), and
  // the second press is the one that switches.
  async onKeyDown(ev) {
    const where = whereToOpen(ev.payload.settings?.openOn, ev.action.device, [...streamDeck.devices]);
    if (!where) return ev.action.showAlert();
    try {
      await streamDeck.profiles.switchToProfile(where.deck, where.profile);
    } catch (err) {
      streamDeck.logger.error(`Couldn't open the Apple Music page: ${err.message}`);
      await ev.action.showAlert();
    }
  }

  // The settings page asks "getDecks" for the rows of its "Open on" menu.
  onSendToPlugin(ev) {
    if (ev.payload?.event !== "getDecks") return;
    return streamDeck.ui.sendToPropertyInspector({ event: "getDecks", items: deckChoices([...streamDeck.devices]) }).catch(() => {});
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
async function sendVolume(level, turned) {
  wantedVolume = Math.max(0, Math.min(100, level));
  lastVolumeSend = Date.now();
  guess({ volume: wantedVolume });
  if (turned) drawTurned(turned);
  else await redrawVolume();
  if (sendingVolume) return true;
  sendingVolume = true;
  try {
    let sent;
    do {
      sent = wantedVolume;
      if (!(await music.setVolume(sent))) return false;
      lastVolumeSend = Date.now();
    } while (wantedVolume !== sent);
    // The spin is over, so every dial showing the volume catches up
    // once, the other one included.
    if (turned) await redrawVolume();
    return true;
  } finally {
    sendingVolume = false;
    wantedVolume = null;
  }
}

// A turn is in progress while a volume script is running and for a
// second and a half after the last one (the same TRUST_MS my Audio Dial
// uses). During that time the once a second read doesn't ask Music
// anything, for two reasons:
//   - Music's own volume lags a turn, so a read landing mid-turn put
//     its older number back on the strip and the next click started
//     from there.
//   - Music answers one script at a time. A status read is about 380 ms,
//     a volume change about 190, so a read that landed in the middle of
//     a spin made every change behind it wait, and the sound caught up
//     in lurches.
// After the window the read is trusted again, which also puts a wrong
// guess right.
const TRUST_MS = 1500;
let lastVolumeSend = 0;
// If the Mac's clock is set back (a time zone change, a sync), "since"
// goes negative, and without the >= 0 the read would be skipped until
// the clock caught up again.
function turning() {
  const since = Date.now() - lastVolumeSend;
  return sendingVolume || (since >= 0 && since < TRUST_MS);
}

// Only the dials that show the volume: Volume, and Multimedia when its
// turn changes the volume. Everything else waits for the once a second
// read.
async function redrawVolume() {
  const showing = onScreen().filter(([kind, target]) => kind instanceof Volume || (kind instanceof Multimedia && kind.settings.get(target.id)?.turns !== "track"));
  await Promise.all(showing.map(([kind, target]) => kind.render(target)));
}

// During a spin, only the dial I'm turning redraws, and at most once
// every DRAW_MS. Stream Deck takes about ten pictures a second for the
// whole plugin, and a fast spin is more clicks than that. Every click
// used to redraw this strip and the Multimedia one (about 50 KB with
// its album art), twenty pictures a second, and the deck froze the
// strips while it caught up. The sound isn't held back: every click
// still goes into wantedVolume and gets sent.
//
// The first click draws straight away so the dial feels instant. A
// click inside the window asks for one more picture at its end (one
// setTimeout, a single shot, not a repeating timer), which draws
// whatever the number is by then, so the last picture is always the
// last number. The other dial catches up once when the spin's sends
// are done (see sendVolume).
const DRAW_MS = 100;
let turnDrawnAt = 0;
let turnDrawLater = null;
let turnTarget = null;
function drawTurned(turned) {
  turnTarget = turned;
  const wait = DRAW_MS - (Date.now() - turnDrawnAt);
  if (wait <= 0 && !turnDrawLater) {
    turnDrawnAt = Date.now();
    void turned.kind.render(turned.target);
    return;
  }
  turnDrawLater ??= setTimeout(() => {
    turnDrawLater = null;
    turnDrawnAt = Date.now();
    void turnTarget.kind.render(turnTarget.target);
  }, Math.max(0, wait));
}

function turnVolume(ticks, step, turned) {
  if (!now?.running) return true;
  const from = wantedVolume ?? mutedFrom ?? now.volume;
  mutedFrom = null;
  return sendVolume(from + ticks * step, turned);
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
// the settings of. A step that isn't one of the menu's choices is 3,
// the same as my Audio Dial, so the two dials turn alike.
function stepOf(settings) {
  const step = Number(settings.step);
  return [1, 2, 3, 5, 10].includes(step) ? step : 3;
}

class Volume extends MusicAction {
  strip = true;

  draw(status, settings) {
    return drawVolume({ volume: status.volume, muted: isMuted(), color: settings.volumeColor });
  }

  turn(target, ticks, status, settings) {
    return turnVolume(ticks, stepOf(settings), { kind: this, target });
  }

  press() {
    return toggleMute();
  }
}

class Multimedia extends MusicAction {
  strip = true;

  draw(status, settings) {
    return drawMultimedia({ ...status, muted: isMuted(), turns: settings.turns === "track" ? "track" : "volume", color: settings.volumeColor });
  }

  // A turn either changes the volume or skips songs, whichever the
  // settings say. A fast spin is still one song, because a spin of
  // five clicks shouldn't skip five songs by accident.
  turn(target, ticks, status, settings) {
    if (settings.turns !== "track") return turnVolume(ticks, 3, { kind: this, target });
    return music.control(ticks > 0 ? "next" : "previous").then(async (open) => {
      await this.render(target);
      return open;
    });
  }

  async press(target, status) {
    guess({ playing: !status.playing });
    return music.control("playpause");
  }
}

// Art for the tiles that aren't the song playing: playlists on the
// Play Playlist key and the Play Collection dial, songs further down
// the Queue dial. Drawing can't wait for a script, so a tile draws
// empty, its art is fetched one at a time, and everything redraws when
// it lands. The newest wish goes first, and only the last few are kept,
// so spinning past forty playlists doesn't line up forty fetches.
const tileArt = new Map();
const wanted = [];
let fetchingTiles = false;
function artFor(key, fetch) {
  if (tileArt.has(key)) return tileArt.get(key);
  if (!wanted.some((wish) => wish.key === key)) wanted.push({ key, fetch });
  if (wanted.length > 6) wanted.shift();
  void fetchTiles();
  return null;
}
async function fetchTiles() {
  if (fetchingTiles) return;
  fetchingTiles = true;
  try {
    while (wanted.length > 0) {
      const { key, fetch } = wanted.pop();
      try {
        tileArt.set(key, await fetch());
      } catch (err) {
        tileArt.set(key, null);
        streamDeck.logger.warn(`Couldn't get a tile's art, so it stays plain: ${err.message}`);
      }
      await redraw();
    }
  } finally {
    fetchingTiles = false;
  }
}
const sourceKey = (source) => `${source.kind}:${source.id ?? source.name}:${source.artist ?? ""}`;
const sourceArt = (source) => artFor(sourceKey(source), () => music.sourceArt(source));

// Plays a playlist, album or artist through the queue, shuffled if
// shuffle is on. "empty" gets a notice, since the press did nothing.
async function play(kind, target, source) {
  const result = await queue.start(source, { shuffle: shuffling(), ...queueEvents });
  if (result === "empty") return kind.notice(target, "Nothing to play");
  return result;
}

// Is this source the one my queue is playing from right now?
function playingFrom(source) {
  const from = queue.remembered()?.source;
  return Boolean(from && queueLive() && sourceKey(from) === sourceKey(source));
}

// The Play Playlist key's choice. The settings page saves it as text
// (JSON, so a name with a comma in it survives), and a key I've never
// set has nothing at all, so anything that doesn't read as a playlist
// or an album means "not picked yet".
function pickedSource(settings) {
  try {
    const source = JSON.parse(settings.list);
    if (["playlist", "album"].includes(source?.kind) && typeof source.name === "string" && source.name) return source;
  } catch {}
  return null;
}

class PlayPlaylist extends MusicAction {
  draw(status, settings) {
    const source = pickedSource(settings);
    if (!source) return drawPlayPlaylist({});
    return drawPlayPlaylist({ name: source.name, art: sourceArt(source), playing: playingFrom(source) });
  }

  async press(target, status, settings) {
    const source = pickedSource(settings);
    if (!source) return this.notice(target, "Pick a playlist");
    return play(this, target, source);
  }

  // The settings page's dropdown asks for "getPlaylists" and gets my
  // playlists, then my library's albums, as two groups. Other messages
  // aren't this page's to answer.
  async onSendToPlugin(ev) {
    if (ev.payload?.event !== "getPlaylists") return;
    try {
      const [lists, records] = await Promise.all([music.playlists(), music.albums()]);
      const item = (source, label) => ({ value: JSON.stringify(source), label });
      await streamDeck.ui.sendToPropertyInspector({
        event: "getPlaylists",
        items: [
          { label: "Playlists", children: lists.map((list) => item({ kind: "playlist", id: list.id, name: list.name }, list.name)) },
          { label: "Albums", children: records.map((record) => item(record, `${record.name}, ${record.artist}`)) },
        ],
      });
    } catch (err) {
      streamDeck.logger.error(`Couldn't list my playlists for the settings page: ${err.message}`);
    }
  }
}

// Lists for the browsing dial are read when it shows up, and again when
// it's pushed after sitting a minute, so a playlist I just made turns up
// without a restart.
const LIST_MS = 60000;

class Collection extends MusicAction {
  strip = true;
  lists = new Map();
  picks = new Map();
  readAt = new Map();

  async onWillAppear(ev) {
    await super.onWillAppear(ev);
    await this.load(ev.action);
  }

  async onDidReceiveSettings(ev) {
    this.settings.set(ev.action.id, ev.payload.settings ?? {});
    await this.load(ev.action);
  }

  browse(target) {
    const browse = this.settings.get(target.id)?.browse;
    return ["albums", "artists"].includes(browse) ? browse : "playlists";
  }

  async load(target) {
    try {
      const browse = this.browse(target);
      const list = browse === "albums" ? await music.albums() : browse === "artists" ? await music.artists() : await music.playlists();
      this.lists.set(target.id, list);
      this.readAt.set(target.id, Date.now());
    } catch (err) {
      streamDeck.logger.error(`Couldn't read my ${this.browse(target)}: ${err.message}`);
    }
    await this.render(target);
  }

  // The highlighted item, remembered by what it is, not by its place,
  // so a refreshed list doesn't move the highlight.
  at(target) {
    const list = this.lists.get(target.id) ?? [];
    const picked = this.picks.get(target.id);
    return Math.max(0, list.findIndex((item) => sourceKey(item) === picked));
  }

  // Until the list has been read once, the strip only says what it's
  // going to show. "No playlists" there would be a fib for a second.
  draw(status, settings, target) {
    if (!this.lists.has(target.id)) return drawStripNotice(`My ${this.browse(target)}`, { dim: true });
    const list = this.lists.get(target.id);
    const at = this.at(target);
    // Only the three tiles on the strip ask for art.
    const items = list.map((item, i) => {
      const near = list.length <= 3 || [0, 1, list.length - 1].includes((i - at + list.length) % list.length);
      return { name: item.name, art: near ? sourceArt(item) : null };
    });
    return drawCollection({ items, at, empty: `No ${this.browse(target)}` });
  }

  turn(target, ticks) {
    const list = this.lists.get(target.id) ?? [];
    if (list.length === 0) return true;
    const next = (((this.at(target) + ticks) % list.length) + list.length) % list.length;
    this.picks.set(target.id, sourceKey(list[next]));
    return this.render(target).then(() => true);
  }

  async press(target) {
    if (Date.now() - (this.readAt.get(target.id) ?? 0) > LIST_MS) await this.load(target);
    const list = this.lists.get(target.id) ?? [];
    if (list.length === 0) return this.notice(target, `No ${this.browse(target)}`);
    return play(this, target, list[this.at(target)]);
  }
}

class Queue extends MusicAction {
  strip = true;
  picks = new Map();

  async onWillAppear(ev) {
    await super.onWillAppear(ev);
    await queue.refresh().catch((err) => streamDeck.logger.error(`Couldn't read the queue playlist: ${err.message}`));
    await this.render(ev.action);
  }

  // Before Music has answered once, "Play from a dial" might not be
  // true yet, so the strip only says what it is.
  draw(status, settings, target) {
    if (status.running === undefined) return drawStripNotice("Queue", { dim: true });
    const view = queue.queueView(status, queue.current(), this.picks.get(target.id));
    const art = view.track ? artFor(view.track.id, () => music.queueArt(view.number, view.track.id)) : null;
    return drawQueue({ view, art, now: status });
  }

  turn(target, ticks, status) {
    const picked = queue.turnPick(status, queue.current(), this.picks.get(target.id), ticks);
    if (picked) this.picks.set(target.id, picked);
    return this.render(target).then(() => true);
  }

  // Plays the highlighted song. The highlight then falls back to "up
  // next", since the song it was on is now the one playing.
  async press(target, status) {
    const view = queue.queueView(status, queue.current(), this.picks.get(target.id));
    if (!view.live) return this.notice(target, "Play from a dial first");
    if (!view.track) return true;
    this.picks.delete(target.id);
    return queue.jump(view.number);
  }
}

// The Add to playlist key. Its settings page lists only my playlists
// (a song can't be added to an album), saved the same way as Play
// Playlist's choice.
class AddTo extends MusicAction {
  added = new Map();

  draw(status, settings, target) {
    const source = pickedSource(settings);
    if (source?.kind !== "playlist") return drawAddTo({});
    return drawAddTo({ name: source.name, added: (this.added.get(target.id) ?? 0) > Date.now() });
  }

  async press(target, status, settings) {
    const source = pickedSource(settings);
    if (source?.kind !== "playlist") return this.notice(target, "Pick a playlist");
    const done = await music.addTo(source);
    if (done === "none") return this.notice(target, "No track");
    // The tick stays two seconds and the once a second redraw takes it
    // away, like a notice.
    if (done) this.added.set(target.id, Date.now() + NOTICE_MS);
    return done;
  }

  async onSendToPlugin(ev) {
    if (ev.payload?.event !== "getAddTargets") return;
    try {
      const lists = await music.playlists();
      await streamDeck.ui.sendToPropertyInspector({
        event: "getAddTargets",
        items: lists.map((list) => ({ value: JSON.stringify({ kind: "playlist", id: list.id, name: list.name }), label: list.name })),
      });
    } catch (err) {
      streamDeck.logger.error(`Couldn't list my playlists for the settings page: ${err.message}`);
    }
  }
}

// The AirPlay dial: turn through the places Music can play to, push to
// play there. The list is read when the dial shows up and again on a
// push after it's sat a minute, so a speaker I just turned on shows up.
class AirPlay extends MusicAction {
  strip = true;
  devices = null;
  readAt = 0;
  picked = null;

  async onWillAppear(ev) {
    await super.onWillAppear(ev);
    await this.load();
  }

  async load() {
    try {
      this.devices = await music.airplayDevices();
      this.readAt = Date.now();
    } catch (err) {
      streamDeck.logger.error(`Couldn't read the AirPlay devices: ${err.message}`);
    }
    await redraw();
  }

  // Picked by name, so a list read again doesn't move the highlight. It
  // starts on the place Music is playing to now.
  at() {
    const list = this.devices ?? [];
    const named = list.findIndex((device) => device.name === this.picked);
    return named >= 0 ? named : Math.max(0, list.findIndex((device) => device.selected));
  }

  draw() {
    if (!this.devices) return drawStripNotice("AirPlay", { dim: true });
    return drawAirPlay({ devices: this.devices, at: this.at() });
  }

  turn(target, ticks) {
    const list = this.devices ?? [];
    if (list.length === 0) return true;
    this.picked = list[(((this.at() + ticks) % list.length) + list.length) % list.length].name;
    return this.render(target).then(() => true);
  }

  async press(target) {
    if (Date.now() - this.readAt > LIST_MS) await this.load();
    const device = this.devices?.[this.at()];
    if (!device) return this.notice(target, "No AirPlay devices");
    const open = await music.selectAirPlay(device.name);
    await this.load();
    return open;
  }
}

// The Saved Search dial. The words live in its settings. A settings
// text box saves after every letter, so the search waits until the
// words have sat still for a moment, and runs on the once a second
// redraw rather than a timer of its own.
const SETTLE_MS = 900;

class SavedSearch extends MusicAction {
  strip = true;
  found = new Map();
  picks = new Map();
  typedAt = new Map();
  searching = new Set();

  async onDidReceiveSettings(ev) {
    this.typedAt.set(ev.action.id, Date.now());
    await super.onDidReceiveSettings(ev);
  }

  words(target) {
    return String(this.settings.get(target.id)?.words ?? "").trim();
  }

  // Starts a search when the words have changed and settled. Drawing
  // can't wait for it, so it redraws when the answer lands.
  look(target) {
    const words = this.words(target);
    const known = this.found.get(target.id);
    const settled = Date.now() - (this.typedAt.get(target.id) ?? 0) > SETTLE_MS;
    if (!words || known?.words === words || !settled || this.searching.has(target.id)) return;
    this.searching.add(target.id);
    music
      .search(words)
      .then((results) => this.found.set(target.id, { words, results, at: Date.now() }))
      .catch((err) => {
        streamDeck.logger.error(`Couldn't search my library: ${err.message}`);
        this.found.set(target.id, { words, results: [] });
      })
      .finally(() => {
        this.searching.delete(target.id);
        this.picks.delete(target.id);
        return this.render(target).catch(() => {});
      });
  }

  at(target) {
    const results = this.found.get(target.id)?.results ?? [];
    return Math.max(0, results.findIndex((song) => song.id === this.picks.get(target.id)));
  }

  draw(status, settings, target) {
    this.look(target);
    const words = this.words(target);
    const known = this.found.get(target.id);
    const results = known?.words === words ? known.results : undefined;
    const song = results?.[this.at(target)];
    const art = song ? artFor(song.id, () => music.libraryArt(song.index, song.id)) : null;
    return drawSearch({ words, results, at: this.at(target), art });
  }

  turn(target, ticks) {
    const results = this.found.get(target.id)?.results ?? [];
    if (results.length === 0) return true;
    this.picks.set(target.id, results[(((this.at(target) + ticks) % results.length) + results.length) % results.length].id);
    return this.render(target).then(() => true);
  }

  // Pushed after sitting a minute, the search runs again first, so a
  // song I just added to my library can turn up.
  async press(target) {
    const known = this.found.get(target.id);
    if (known && Date.now() - (known.at ?? 0) > LIST_MS) {
      const results = await music.search(this.words(target));
      this.found.set(target.id, { words: this.words(target), results, at: Date.now() });
      this.picks.delete(target.id);
      await this.render(target);
    }
    const song = this.found.get(target.id)?.results?.[this.at(target)];
    if (!song) return this.notice(target, "Nothing to play");
    const played = await music.playLibraryTrack(song.index, song.id);
    if (played === "moved") {
      // The library changed since the search. Searching again fixes it.
      this.found.delete(target.id);
      return this.notice(target, "Search again");
    }
    return played;
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
register("playplaylist", PlayPlaylist);
register("collection", Collection);
register("queue", Queue);
register("addto", AddTo);
register("airplay", AirPlay);
register("search", SavedSearch);

// connect() comes after the actions are registered.
streamDeck.connect();
