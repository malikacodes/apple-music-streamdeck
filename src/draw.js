// Draws the keys and the dial strips as SVG text. It only draws: no
// Stream Deck in here, so the tests can read what it made.

const FONT = "-apple-system, Helvetica, sans-serif";

// Pure black, to match the deck. Anything lighter shows up as a gray
// square next to the keys around it.
const BLACK = "#000000";
const WHITE = "#ffffff";
const DIM = "#5c5c62";
// My soft pink, the one accent in all my plugins (white is the default,
// black the background). It's the only color here: the heart, the
// volume bar and anything that's switched on.
const PINK = "#f2a7c3";

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

// The type, the same scale in all my plugins (taken from my Audio
// Dial): a name or label is 15 at weight 600, a value is 22 at 600, a
// notice that takes a strip over is 15 at 400, and a small second line
// under something is 14 at 400 in the dim gray. 600 is the heaviest
// anything gets. A name that doesn't fit is cut with fit(), never made
// smaller.
function words(x, y, said, { size, weight, color = WHITE, anchor }) {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}"${anchor ? ` text-anchor="${anchor}"` : ""} fill="${color}">${safe(said)}</text>`;
}
const label = (x, y, said, options = {}) => words(x, y, said, { size: 15, weight: 600, ...options });
const value = (x, y, said, options = {}) => words(x, y, said, { size: 22, weight: 600, ...options });
const notice = (x, y, said, options = {}) => words(x, y, said, { size: 15, weight: 400, ...options });
const small = (x, y, said, options = {}) => words(x, y, said, { size: 14, weight: 400, color: DIM, ...options });

// Keys are bigger than strips, the way my Pomodoro timer key does it: a
// label on a key is 20 at weight 600. (A key's big value would be 38,
// but no key here shows a number.)
const keyLabel = (y, said, options = {}) => words(72, y, said, { size: 20, weight: 600, anchor: "middle", ...options });

function key(inside) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144" font-family="${FONT}">`,
    `<rect width="144" height="144" fill="${BLACK}"/>`,
    inside,
    `</svg>`,
  ].join("");
}

// A short message that takes a key over, like "Open Music" or "No
// track", at the key label's size. Words go on their own lines when they
// don't fit on one, three lines at most.
export function drawNotice(text) {
  const lines = [];
  for (const word of String(text).split(" ")) {
    const last = lines.length - 1;
    if (last >= 0 && guessWidth(`${lines[last]} ${word}`, 20) <= 120) lines[last] += ` ${word}`;
    else lines.push(word);
  }
  const shown = lines.slice(0, 3).map((line) => fit(line, 124, 20));
  const top = 79 - ((shown.length - 1) * 26) / 2;
  return key(shown.map((line, i) => keyLabel(top + i * 26, line)).join(""));
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

// A row of dots along the bottom of a key: "this many choices, and I'm
// on this one". The lit dot is white and the rest are dim.
function dots(lit, count) {
  return Array.from({ length: count }, (_, i) => `<circle cx="${72 + (i - (count - 1) / 2) * 16}" cy="126" r="4" fill="${i === lit ? WHITE : DIM}"/>`).join("");
}

// A loop of two arrows. Stream Deck can only flip a key between two
// pictures, and Repeat has three, so the plugin draws all three itself:
// dim for off, pink for the whole list, pink with a 1 for one song. The
// dots underneath say which of the three it's on, in the order a press
// goes round: off, all, one.
const REPEAT_ORDER = ["off", "all", "one"];
export function drawRepeat({ mode = "off" } = {}) {
  const color = mode === "off" ? DIM : PINK;
  const one = mode === "one" ? keyLabel(79, "1", { color: PINK }) : "";
  return key(
    `<g ${pen(color)}>` +
      `<path d="M36 70v-8c0-7 5-12 12-12h54"/><path d="M92 40l11 10-11 10"/>` +
      `<path d="M108 74v8c0 7-5 12-12 12H42"/><path d="M52 84l-11 10 11 10"/>` +
      `</g>${one}${dots(REPEAT_ORDER.indexOf(mode), REPEAT_ORDER.length)}`,
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
  return strip(notice(100, 56, fit(text, 180, 15), { color: dim ? DIM : WHITE, anchor: "middle" }));
}

// The volume bar, the same as my Audio Dial's so the two dials match
// side by side: 8 pixels high and rounded, on a dark track, and never
// thinner than its own height once there's any volume at all, so 1%
// still reads as a dot and not a sliver. The track is the one thing
// drawn in a gray darker than DIM, on purpose: it's a groove, not a box.
const TRACK = "#2c2c30";
function bar({ x, y, width, share, color }) {
  const filled = Math.round(Math.max(0, Math.min(1, share)) * width);
  return `<rect x="${x}" y="${y}" width="${width}" height="8" rx="4" fill="${TRACK}"/>` + (filled > 0 ? `<rect x="${x}" y="${y}" width="${Math.max(filled, 8)}" height="8" rx="4" fill="${color}"/>` : "");
}

// The bar's color comes from the dial's settings and goes straight into
// the SVG, so anything that isn't a plain hex color like #f2a7c3 falls
// back to the pink instead of breaking the picture.
export function barColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value ?? "") ? value : PINK;
}

// The Volume dial's strip, laid out exactly like my Audio Dial's: what
// it's for at the top left, the number as a percent under it, and the
// bar along the bottom. Muted says so in place of the number and the bar
// goes dim, so muted and turned all the way down look different. Before
// the first read there's no number at all, rather than a 0 that isn't
// true.
export function drawVolume({ volume, muted = false, color } = {}) {
  const known = Number.isFinite(volume);
  const level = known ? Math.round(Math.max(0, Math.min(100, volume))) : 0;
  const shown = muted ? "Muted" : known ? `${level}%` : "";
  return strip(
    label(14, 30, "Music") +
      value(14, 64, shown, { color: muted ? DIM : WHITE }) +
      bar({ x: 14, y: 78, width: 172, share: level / 100, color: muted ? DIM : barColor(color) }),
  );
}

// A music note, the one in the plugin's icon, at any size.
const NOTE = (x, y, s, color) =>
  `<g transform="translate(${x} ${y}) scale(${Number(s.toFixed(3))})" fill="${color}"><path d="M10 21V7l11-2.5v14" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/><ellipse cx="7.5" cy="21" rx="3.5" ry="2.8"/><ellipse cx="18.5" cy="18.5" rx="3.5" ry="2.8"/></g>`;

// The rounded tile a song's art sits on. Art comes in as a data URI
// (the picture packed into text) and is clipped to the tile's corners.
// With no art yet, it's a dim outline with a note in it.
//
// Paused art is dimmed, and the tiles either side of a browsing dial's
// pick are faded further. Only art is ever see-through: a photo going
// dark over black still reads as a photo, but white or the dim gray at
// a third goes to a flat gray square, which is the look I don't want
// next to my black keys. So an empty tile stays the plain dim outline.
function tile({ art, x, y, size, radius, dim = false, faded = false, id }) {
  if (!art) {
    return `<rect x="${x + 1}" y="${y + 1}" width="${size - 2}" height="${size - 2}" rx="${radius}" fill="none" stroke="${DIM}" stroke-width="2"/>` + NOTE(x + size / 2 - size * 0.25, y + size / 2 - size * 0.25, size / 56, DIM);
  }
  return (
    `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}"/></clipPath>` +
    `<image href="${art}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"${faded ? ' opacity="0.3"' : dim ? ' opacity="0.45"' : ""}/>`
  );
}

// Strips with a song's art keep the Audio Dial's places for the words
// (name at y=30, value at y=64, bar at y=78, all from x=14), so the art
// moves to the right. It sits a little down from the top: in a dial
// stack, Stream Deck draws its own icon in the top right corner.
const ART_TILE = { x: 146, y: 20, size: 40, radius: 10 };
const TEXT_W = 124;

// The Multimedia dial's strip: the song and the artist under it, the
// art on the right, and the bar along the bottom. The bar is the volume
// when the dial turns the volume, and how far into the song I am when
// it skips, so it always shows what a turn changes.
export function drawMultimedia({ art, name, artist, playing = false, volume = 0, muted = false, position = 0, duration = 0, turns = "volume", color } = {}) {
  const parts = [tile({ art, ...ART_TILE, dim: Boolean(art) && !playing, id: "art" })];
  if (!name) {
    parts.push(notice(14, 30, "No track", { color: DIM }));
    return strip(parts.join(""));
  }
  parts.push(label(14, 30, fit(name, TEXT_W, 15)));
  parts.push(small(14, 52, fit(artist ?? "", TEXT_W, 14)));
  if (turns === "track") parts.push(bar({ x: 14, y: 78, width: 172, share: duration ? position / duration : 0, color: WHITE }));
  else parts.push(bar({ x: 14, y: 78, width: 172, share: volume / 100, color: muted ? DIM : barColor(color) }));
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
  if (!name) return key(keyLabel(68, "Pick a", { color: DIM }) + keyLabel(94, "playlist", { color: DIM }));
  const ring = playing ? `<rect x="23" y="5" width="98" height="98" rx="26" fill="none" stroke="${PINK}" stroke-width="4"/>` : "";
  return key(tile({ art, x: 28, y: 10, size: 88, radius: 22, id: "art" }) + ring + keyLabel(131, fit(name, 120, 20)));
}

// The Play Collection dial: the highlighted playlist's whole name in
// the name's place at the top, its tile under it in the middle and the
// ones either side faded. Names don't fit under three tiles, so turning
// picks one and that one gets the full width.
export function drawCollection({ items = [], at = 0, empty = "No playlists" } = {}) {
  if (items.length === 0) return drawStripNotice(empty);
  const pick = (offset) => items[(((at + offset) % items.length) + items.length) % items.length];
  const parts = [label(14, 30, fit(pick(0).name, 172, 15))];
  if (items.length > 2) parts.push(tile({ art: pick(-1).art, x: 24, y: 48, size: 40, radius: 10, faded: true, id: "before" }));
  if (items.length > 1) parts.push(tile({ art: pick(1).art, x: 136, y: 48, size: 40, radius: 10, faded: true, id: "after" }));
  parts.push(tile({ art: pick(0).art, x: 74, y: 42, size: 52, radius: 12, id: "here" }));
  return strip(parts.join(""));
}

// The Queue dial. When the music is coming from my queue: the
// highlighted song's name, "3 of 42" as the value with the artist under
// it, and its art on the right. The number is pink when it's the song up
// next.
// When it isn't my queue (Music's own window, a catalogue stream), it
// says how to get one and shows only the current song's art, because
// anything more would be a guess.
//   view   from queueView() in queue.js
//   art    the highlighted song's art
//   now    the song that's playing, for its art when there's no queue
export function drawQueue({ view = { live: false }, art, now = {} } = {}) {
  if (!view.live) {
    const lines = view.musicShuffle ? ["Music's own", "shuffle is on"] : ["Play from a dial", "to see your", "queue"];
    const top = 54 - ((lines.length - 1) * 20) / 2;
    if (!now.id) return strip(lines.map((line, i) => notice(100, top + i * 20, line, { anchor: "middle" })).join(""));
    return strip(tile({ art: now.art, ...ART_TILE, id: "now" }) + lines.map((line, i) => notice(14, top + i * 20, line)).join(""));
  }
  if (view.last) return drawStripNotice("End of the queue");
  return strip(
    tile({ art, ...ART_TILE, id: "next" }) +
      label(14, 30, fit(view.track.name, TEXT_W, 15)) +
      value(14, 64, `${view.number} of ${view.total}`, { color: view.next ? PINK : WHITE }) +
      small(14, 86, fit(view.track.artist ?? "", 172, 14)),
  );
}

// The Add to playlist key: a list with a plus, and the playlist's name
// along the bottom. After a press it's a pink tick for two seconds, so
// I know the song went in.
export function drawAddTo({ name, added = false } = {}) {
  if (!name) return key(keyLabel(68, "Pick a", { color: DIM }) + keyLabel(94, "playlist", { color: DIM }));
  if (added) return key(`<path d="M42 70l20 20 40-44" ${pen(PINK)}/>` + keyLabel(131, "Added"));
  return key(
    `<g ${pen(WHITE)}><path d="M34 36h52M34 58h52M34 80h30"/><path d="M96 66v34M79 83h34" stroke="${PINK}"/></g>` + keyLabel(131, fit(name, 120, 20)),
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

// The AirPlay dial: the highlighted place's full name at the top, its
// picture under it in the middle, its neighbours in the dim gray either
// side. The one
// Music is playing to now is pink, so I can see where I am before I
// push.
export function drawAirPlay({ devices = [], at = 0 } = {}) {
  if (devices.length === 0) return drawStripNotice("No AirPlay devices");
  const pick = (offset) => devices[(((at + offset) % devices.length) + devices.length) % devices.length];
  const parts = [label(14, 30, fit(pick(0).name, 172, 15))];
  if (devices.length > 2) parts.push(place(pick(-1).kind, 26, 50, 36, pick(-1).selected ? PINK : DIM));
  if (devices.length > 1) parts.push(place(pick(1).kind, 138, 50, 36, pick(1).selected ? PINK : DIM));
  parts.push(place(pick(0).kind, 76, 42, 48, pick(0).selected ? PINK : WHITE));
  return strip(parts.join(""));
}

// The Saved Search dial: laid out like the Queue dial, the song's name,
// "3 of 23" with the artist under it, and the art on the right. No words yet,
// or nothing that matches, each say so.
export function drawSearch({ words: searched = "", results, at = 0, art } = {}) {
  if (!String(searched).trim()) return drawStripNotice("Add search words", { dim: true });
  if (!results) return drawStripNotice("Searching", { dim: true });
  if (results.length === 0) return strip(notice(100, 46, "Nothing matches", { anchor: "middle" }) + small(100, 68, fit(`“${String(searched).trim()}”`, 180, 14), { anchor: "middle" }));
  const song = results[at] ?? results[0];
  return strip(
    tile({ art, ...ART_TILE, id: "found" }) +
      label(14, 30, fit(song.name, TEXT_W, 15)) +
      value(14, 64, `${results.indexOf(song) + 1} of ${results.length}`) +
      small(14, 86, fit(song.artist ?? "", 172, 14)),
  );
}
