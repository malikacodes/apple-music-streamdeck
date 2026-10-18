// Draws the keys and the dial strips as SVG text. It only draws: no
// Stream Deck in here, so the tests can read what it made.

const FONT = "-apple-system, Helvetica, sans-serif";

// Pure black, to match the deck. Anything lighter shows up as a gray
// square next to the keys around it.
const BLACK = "#000000";
const WHITE = "#ffffff";
const DIM = "#5c5c62";
// Apple Music's pink-red. It's the only color: the heart, the volume
// bar and anything that's switched on.
const PINK = "#fc3c44";

// Text I typed can have a & or a < in it, and in SVG those mean
// something. This swaps them for their safe spellings.
export function safe(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// SVG can't measure text, so this guesses how wide a name will be and
// cuts it with an ellipsis before it runs off. Thin letters count less
// than wide ones. The guesses are on the wide side on purpose: the deck
// draws letters wider than Chrome does, so a name that only just fits
// in a preview runs over on the real strip.
const THIN = new Set("iIl.,:;'|!jft() ");
const WIDE = new Set("mwMW@");
function guessWidth(text, size) {
  let units = 0;
  for (const letter of text) {
    if (THIN.has(letter)) units += 0.34;
    else if (WIDE.has(letter)) units += 0.92;
    else if (letter >= "A" && letter <= "Z") units += 0.7;
    else units += 0.58;
  }
  return units * size;
}

export function fit(text, width, size) {
  const whole = String(text ?? "");
  if (guessWidth(whole, size) <= width) return whole;
  let cut = whole;
  while (cut.length > 0 && guessWidth(`${cut}…`, size) > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

function key(inside) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144" font-family="${FONT}">`,
    `<rect width="144" height="144" fill="${BLACK}"/>`,
    inside,
    `</svg>`,
  ].join("");
}

// A short message that takes a key over, like "Open Music". Words go on
// their own lines when they don't fit on one, three lines at most.
export function drawNotice(text) {
  const lines = [];
  for (const word of String(text).split(" ")) {
    const last = lines.length - 1;
    if (last >= 0 && guessWidth(`${lines[last]} ${word}`, 24) <= 120) lines[last] += ` ${word}`;
    else lines.push(word);
  }
  const shown = lines.slice(0, 3).map((line) => fit(line, 124, 24));
  const top = 80 - ((shown.length - 1) * 30) / 2;
  return key(
    shown.map((line, i) => `<text x="72" y="${top + i * 30}" font-size="24" font-weight="600" text-anchor="middle" fill="${WHITE}">${safe(line)}</text>`).join(""),
  );
}

// The shapes on the Playback key, all centered on the key.
const GLYPHS = {
  play: `<path d="M54 36l46 36-46 36z" fill="${WHITE}"/>`,
  pause: `<rect x="48" y="38" width="16" height="68" rx="4" fill="${WHITE}"/><rect x="80" y="38" width="16" height="68" rx="4" fill="${WHITE}"/>`,
  previous: `<rect x="34" y="40" width="10" height="64" rx="3" fill="${WHITE}"/><path d="M108 40v64L56 72z" fill="${WHITE}"/>`,
  next: `<rect x="100" y="40" width="10" height="64" rx="3" fill="${WHITE}"/><path d="M36 40v64l52-32z" fill="${WHITE}"/>`,
};

// The Playback key. "job" is what the dropdown says, "playing" is whether
// the music is going right now (only Play/Pause cares).
export function drawPlayback({ job = "playpause", playing = false } = {}) {
  if (job === "previous") return key(GLYPHS.previous);
  if (job === "next") return key(GLYPHS.next);
  return key(playing ? GLYPHS.pause : GLYPHS.play);
}

// Lines drawn with a thick round pen, for the Shuffle and Repeat shapes.
const pen = (color) => `fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"`;

// Two arrows that cross. Pink when Music is shuffling, dim when it isn't.
export function drawShuffle({ on = false } = {}) {
  const color = on ? PINK : DIM;
  return key(
    `<g ${pen(color)}>` +
      `<path d="M30 52h18c18 0 30 40 48 40h12"/><path d="M30 92h18c18 0 30-40 48-40h12"/>` +
      `<path d="M98 42l11 10-11 10"/><path d="M98 82l11 10-11 10"/>` +
      `</g>`,
  );
}

// A loop of two arrows. Stream Deck can only flip a key between two
// pictures, and Repeat has three, so the plugin draws all three itself:
// dim for off, pink for the whole list, pink with a 1 for one song.
export function drawRepeat({ mode = "off" } = {}) {
  const color = mode === "off" ? DIM : PINK;
  const one = mode === "one" ? `<text x="72" y="82" font-size="28" font-weight="700" text-anchor="middle" fill="${PINK}">1</text>` : "";
  return key(
    `<g ${pen(color)}>` +
      `<path d="M36 70v-8c0-7 5-12 12-12h54"/><path d="M92 40l11 10-11 10"/>` +
      `<path d="M108 74v8c0 7-5 12-12 12H42"/><path d="M52 84l-11 10 11 10"/>` +
      `</g>${one}`,
  );
}

const HEART = "M72 110C72 110 30 85 30 57c0-13 10-23 23-23 8 0 15 4 19 11 4-7 11-11 19-11 13 0 23 10 23 23 0 28-42 53-42 53z";

// The heart is filled when the song is a favorite and an outline when
// it isn't. With nothing playing it's a dim outline, since there's no
// song to favorite.
export function drawFavorite({ on = false, track = true } = {}) {
  if (on && track) return key(`<path d="${HEART}" fill="${PINK}"/>`);
  return key(`<path d="${HEART}" fill="none" stroke="${track ? WHITE : DIM}" stroke-width="7" stroke-linejoin="round"/>`);
}

function strip(inside) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100" font-family="${FONT}">`,
    `<rect width="200" height="100" fill="${BLACK}"/>`,
    inside,
    `</svg>`,
  ].join("");
}

// The strip's version of a notice: one line, in the middle. A dim one
// is a quiet label, for while a dial is still reading what to show.
export function drawStripNotice(text, { dim = false } = {}) {
  return strip(`<text x="100" y="56" font-size="17" font-weight="600" text-anchor="middle" fill="${dim ? DIM : WHITE}">${safe(fit(text, 180, 17))}</text>`);
}

// A bar that fills from the left. The empty part is dim and the full
// part is the color handed in.
function bar({ x, y, width, share, color }) {
  const full = Math.max(0, Math.min(1, share)) * width;
  return `<rect x="${x}" y="${y}" width="${width}" height="6" rx="3" fill="${DIM}"/>` + (full > 0 ? `<rect x="${x}" y="${y}" width="${full.toFixed(1)}" height="6" rx="3" fill="${color}"/>` : "");
}

// The Volume dial's strip: the word, the number, and a pink bar. Muted
// says so in place of the number, and the bar goes dim, so a quick look
// tells muted apart from turned all the way down. Before the first read
// there's no number at all, rather than a 0 that isn't true.
export function drawVolume({ volume, muted = false } = {}) {
  const known = Number.isFinite(volume);
  const level = known ? Math.round(Math.max(0, Math.min(100, volume))) : 0;
  const shown = muted ? "Muted" : known ? level : "";
  return strip(
    `<text x="16" y="34" font-size="15" fill="${DIM}">Volume</text>` +
      `<text x="184" y="44" font-size="${muted ? 20 : 34}" font-weight="700" text-anchor="end" fill="${muted ? DIM : WHITE}">${shown}</text>` +
      bar({ x: 16, y: 68, width: 168, share: level / 100, color: muted ? DIM : PINK }),
  );
}

// The rounded tile a song's art sits on. Art comes in as a data URI
// (the picture packed into text) and is clipped to the tile's corners.
// With no art yet, it's an outline with a note in it. Paused art is
// dimmed: dark over black, not gray, so it still passes the black test.
const NOTE = (x, y, s, color) =>
  `<g transform="translate(${x} ${y}) scale(${Number(s.toFixed(3))})" fill="${color}"><path d="M10 21V7l11-2.5v14" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/><ellipse cx="7.5" cy="21" rx="3.5" ry="2.8"/><ellipse cx="18.5" cy="18.5" rx="3.5" ry="2.8"/></g>`;

function tile({ art, x, y, size, radius, dim = false, id }) {
  if (!art) {
    return `<rect x="${x + 1}" y="${y + 1}" width="${size - 2}" height="${size - 2}" rx="${radius}" fill="none" stroke="${DIM}" stroke-width="2"/>` + NOTE(x + size / 2 - size * 0.25, y + size / 2 - size * 0.25, size / 56, DIM);
  }
  return (
    `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}"/></clipPath>` +
    `<image href="${art}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"${dim ? ' opacity="0.45"' : ""}/>`
  );
}

// The Multimedia dial's strip: the art top left, the artist next to
// it, and the song's name along the bottom, where it gets the whole
// width of the strip. Next to the art there's only room for a few
// letters, and a song name cut to "Get Me So…" isn't much use.
// The bar is the volume when the dial turns the volume, and how far into
// the song I am when it skips, so it always shows what a turn changes.
export function drawMultimedia({ art, name, artist, playing = false, volume = 0, muted = false, position = 0, duration = 0, turns = "volume" } = {}) {
  const parts = [tile({ art, x: 12, y: 8, size: 58, radius: 12, dim: Boolean(art) && !playing, id: "art" })];
  if (!name) {
    parts.push(`<text x="82" y="44" font-size="15" font-weight="600" fill="${DIM}">No track</text>`);
    return strip(parts.join(""));
  }
  parts.push(`<text x="82" y="30" font-size="13" fill="${DIM}">${safe(fit(artist ?? "", 106, 13))}</text>`);
  if (turns === "track") parts.push(bar({ x: 82, y: 48, width: 104, share: duration ? position / duration : 0, color: WHITE }));
  else parts.push(bar({ x: 82, y: 48, width: 104, share: volume / 100, color: muted ? DIM : PINK }));
  parts.push(`<text x="12" y="90" font-size="15" font-weight="600" fill="${WHITE}">${safe(fit(name, 176, 15))}</text>`);
  return strip(parts.join(""));
}

// The Now Playing key for my XL. The art fills a rounded tile with a
// little black around it, the same numbers as my app-icon keys, so it
// sits right next to them. Paused, the art dims and a pause sign sits
// in the corner on a black circle. With art still on its way it's the
// empty tile, and with nothing loaded at all it's only a dim note.
export function drawNowPlaying({ art, id, playing = false } = {}) {
  if (!id) return key(NOTE(30, 30, 3, DIM));
  if (!art) return key(tile({ art: null, x: 12, y: 12, size: 120, radius: 32 }));
  const paused = playing
    ? ""
    : `<circle cx="110" cy="110" r="22" fill="${BLACK}"/><rect x="101" y="99" width="6" height="22" rx="2" fill="${WHITE}"/><rect x="113" y="99" width="6" height="22" rx="2" fill="${WHITE}"/>`;
  return key(tile({ art, x: 12, y: 12, size: 120, radius: 32, dim: !playing, id: "art" }) + paused);
}

// The Play Playlist key: the playlist's tile (the art of its first
// song) with its name along the bottom. A thin pink ring goes round the
// tile while it's the one playing. A key I haven't picked a playlist for
// yet says so, dimmed.
export function drawPlayPlaylist({ name, art, playing = false } = {}) {
  if (!name) {
    return key(
      `<text x="72" y="66" font-size="20" font-weight="600" text-anchor="middle" fill="${DIM}">Pick a</text>` +
        `<text x="72" y="92" font-size="20" font-weight="600" text-anchor="middle" fill="${DIM}">playlist</text>`,
    );
  }
  const ring = playing ? `<rect x="23" y="5" width="98" height="98" rx="26" fill="none" stroke="${PINK}" stroke-width="4"/>` : "";
  return key(
    tile({ art, x: 28, y: 10, size: 88, radius: 22, id: "art" }) +
      ring +
      `<text x="72" y="130" font-size="17" font-weight="600" text-anchor="middle" fill="${WHITE}">${safe(fit(name, 130, 17))}</text>`,
  );
}

// The Play Collection dial: the highlighted playlist's tile in the
// middle, the ones either side of it faded, and its whole name along
// the bottom. Names don't fit under three tiles, so turning picks one
// and that one gets the full width. Faded is dark over black, not gray,
// so it passes the black test.
export function drawCollection({ items = [], at = 0, empty = "No playlists" } = {}) {
  if (items.length === 0) return drawStripNotice(empty);
  const pick = (offset) => items[(((at + offset) % items.length) + items.length) % items.length];
  const parts = [];
  if (items.length > 2) parts.push(`<g opacity="0.3">${tile({ art: pick(-1).art, x: 14, y: 14, size: 44, radius: 10, id: "before" })}</g>`);
  if (items.length > 1) parts.push(`<g opacity="0.3">${tile({ art: pick(1).art, x: 142, y: 14, size: 44, radius: 10, id: "after" })}</g>`);
  parts.push(tile({ art: pick(0).art, x: 70, y: 6, size: 60, radius: 13, id: "here" }));
  parts.push(`<text x="100" y="90" font-size="15" font-weight="600" text-anchor="middle" fill="${WHITE}">${safe(fit(pick(0).name, 180, 15))}</text>`);
  return strip(parts.join(""));
}

// The Queue dial. When the music is coming from my queue: the
// highlighted song's tile, "3 of 42" and the artist next to it, and its
// name along the bottom. The number is pink when it's the song up next. When it isn't (Music's own window, a catalogue
// stream), it says how to get a queue and shows only the current
// song's art, because anything more would be a guess.
//   view   from queueView() in queue.js
//   art    the highlighted song's art
//   now    the song that's playing, for its art when there's no queue
export function drawQueue({ view = { live: false }, art, now = {} } = {}) {
  if (!view.live) {
    const lines = view.musicShuffle ? ["Music's own", "shuffle is on"] : ["Play from a dial", "to see your", "queue"];
    if (!now.id) return strip(lines.map((line, i) => `<text x="100" y="${34 + i * 20}" font-size="15" font-weight="600" text-anchor="middle" fill="${DIM}">${line}</text>`).join(""));
    return strip(
      tile({ art: now.art, x: 12, y: 21, size: 58, radius: 12, id: "now" }) +
        lines.map((line, i) => `<text x="82" y="${36 + i * 18}" font-size="14" font-weight="600" fill="${DIM}">${line}</text>`).join(""),
    );
  }
  if (view.last) return drawStripNotice("End of the queue");
  return strip(
    tile({ art, x: 12, y: 8, size: 58, radius: 12, id: "next" }) +
      `<text x="82" y="30" font-size="13" fill="${view.next ? PINK : DIM}">${view.number} of ${view.total}</text>` +
      `<text x="82" y="52" font-size="13" fill="${DIM}">${safe(fit(view.track.artist ?? "", 106, 13))}</text>` +
      `<text x="12" y="90" font-size="15" font-weight="600" fill="${WHITE}">${safe(fit(view.track.name, 176, 15))}</text>`,
  );
}

// The Add to playlist key: a list with a plus, and the playlist's name
// along the bottom. After a press it's a pink tick for two seconds, so
// I know the song went in.
export function drawAddTo({ name, added = false } = {}) {
  if (!name) {
    return key(
      `<text x="72" y="66" font-size="20" font-weight="600" text-anchor="middle" fill="${DIM}">Pick a</text>` +
        `<text x="72" y="92" font-size="20" font-weight="600" text-anchor="middle" fill="${DIM}">playlist</text>`,
    );
  }
  if (added) return key(`<path d="M42 70l20 20 40-44" ${pen(PINK)}/><text x="72" y="130" font-size="17" font-weight="600" text-anchor="middle" fill="${WHITE}">Added</text>`);
  return key(
    `<g ${pen(WHITE)}><path d="M34 36h52M34 58h52M34 80h30"/><path d="M96 66v34M79 83h34" stroke="${PINK}"/></g>` +
      `<text x="72" y="130" font-size="17" font-weight="600" text-anchor="middle" fill="${WHITE}">${safe(fit(name, 130, 17))}</text>`,
  );
}

// Small pictures for the places Music can play to: a laptop, a speaker,
// a TV, and the AirPlay sign for anything else. Each is drawn at 40 by
// 40 and moved into place.
const PLACES = {
  computer: `<rect x="7" y="8" width="26" height="18" rx="2"/><path d="M3 31h34"/>`,
  speaker: `<rect x="11" y="4" width="18" height="32" rx="6"/><circle cx="20" cy="24" r="5"/>`,
  "Apple TV": `<rect x="4" y="7" width="32" height="21" rx="3"/><path d="M14 34h12"/>`,
  other: `<path d="M8 28H5V7h30v21h-3"/><path d="M20 24l9 11H11z"/>`,
};
function place(kind, x, y, size, color) {
  const shape = PLACES[kind] ?? (kind === "television" ? PLACES["Apple TV"] : PLACES.other);
  return `<g transform="translate(${x} ${y}) scale(${Number((size / 40).toFixed(3))})" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${shape}</g>`;
}

// The AirPlay dial: the highlighted place in the middle with its full
// name along the bottom, its neighbours faded either side. The one
// Music is playing to now is pink, so I can see where I am before I
// push.
export function drawAirPlay({ devices = [], at = 0 } = {}) {
  if (devices.length === 0) return drawStripNotice("No AirPlay devices");
  const pick = (offset) => devices[(((at + offset) % devices.length) + devices.length) % devices.length];
  const parts = [];
  if (devices.length > 2) parts.push(`<g opacity="0.3">${place(pick(-1).kind, 18, 16, 36, pick(-1).selected ? PINK : WHITE)}</g>`);
  if (devices.length > 1) parts.push(`<g opacity="0.3">${place(pick(1).kind, 146, 16, 36, pick(1).selected ? PINK : WHITE)}</g>`);
  parts.push(place(pick(0).kind, 74, 6, 52, pick(0).selected ? PINK : WHITE));
  parts.push(`<text x="100" y="90" font-size="15" font-weight="600" text-anchor="middle" fill="${WHITE}">${safe(fit(pick(0).name, 180, 15))}</text>`);
  return strip(parts.join(""));
}

// The Saved Search dial: the highlighted song's tile, "3 of 23" and the
// artist next to it, and the song's name along the bottom. No words yet,
// or nothing that matches, each say so.
export function drawSearch({ words = "", results, at = 0, art } = {}) {
  if (!String(words).trim()) return drawStripNotice("Add search words", { dim: true });
  if (!results) return drawStripNotice("Searching", { dim: true });
  if (results.length === 0) {
    return strip(
      `<text x="100" y="44" font-size="16" font-weight="600" text-anchor="middle" fill="${WHITE}">Nothing matches</text>` +
        `<text x="100" y="68" font-size="15" text-anchor="middle" fill="${DIM}">${safe(fit(`“${String(words).trim()}”`, 180, 15))}</text>`,
    );
  }
  const song = results[at] ?? results[0];
  return strip(
    tile({ art, x: 12, y: 8, size: 58, radius: 12, id: "found" }) +
      `<text x="82" y="30" font-size="13" fill="${DIM}">${(results.indexOf(song) + 1)} of ${results.length}</text>` +
      `<text x="82" y="52" font-size="13" fill="${DIM}">${safe(fit(song.artist ?? "", 106, 13))}</text>` +
      `<text x="12" y="90" font-size="15" font-weight="600" fill="${WHITE}">${safe(fit(song.name, 176, 15))}</text>`,
  );
}
