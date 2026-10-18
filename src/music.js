// Every question I ask the Music app lives in this file, and nothing else
// in the plugin runs osascript. Each one goes through run.js, so each
// gets its three second limit.
import { run } from "./run.js";

// Talking to an app by name starts it if it isn't open. I don't want
// the deck opening Music behind my back, so every script is wrapped:
// it asks the Mac whether Music is running first, and only talks to it
// if it is. "is running" doesn't start anything.
// Scripts hand back the word "closed" when Music isn't there.
export const CLOSED = "closed";

function guarded(body) {
  return [
    'if application "Music" is running then',
    '  tell application "Music"',
    body,
    "  end tell",
    "else",
    `  return "${CLOSED}"`,
    "end if",
  ].join("\n");
}

async function ask(body, options) {
  const { stdout } = await run("/usr/bin/osascript", ["-e", guarded(body)], options);
  return stdout.replace(/\n$/, "");
}

// What the Playback key's dropdown can mean, and the Music command for each.
const CONTROLS = {
  playpause: "playpause",
  previous: "previous track",
  next: "next track",
};

// Returns false when Music isn't open, so the key can say so.
export async function control(job) {
  const command = CONTROLS[job] ?? CONTROLS.playpause;
  return (await ask(`    ${command}`)) !== CLOSED;
}
