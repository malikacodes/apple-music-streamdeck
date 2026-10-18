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
