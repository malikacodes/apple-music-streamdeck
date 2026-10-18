// Draws the keys and the dial strips as SVG text. It only draws: no
// Stream Deck in here, so the tests can read what it made.

const FONT = "-apple-system, Helvetica, sans-serif";

// Pure black, to match the deck. Anything lighter shows up as a gray
// square next to the keys around it.
const BLACK = "#000000";
const WHITE = "#ffffff";
const DIM = "#5c5c62";

// Text I typed can have a & or a < in it, and in SVG those mean
// something. This swaps them for their safe spellings.
export function safe(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function key(inside) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144" font-family="${FONT}">`,
    `<rect width="144" height="144" fill="${BLACK}"/>`,
    inside,
    `</svg>`,
  ].join("");
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
