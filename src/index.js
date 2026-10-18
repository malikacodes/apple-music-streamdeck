// The only file that talks to Stream Deck. It hears presses and turns and
// sends pictures back. The drawing is in draw.js and everything that asks
// Music something is in music.js.
import streamDeck, { action, SingletonAction } from "@elgato/streamdeck";
import { drawPlayback } from "./draw.js";
import { control } from "./music.js";

// Keep this at "info". The "trace" level writes every message between the
// plugin and Stream Deck into the log file, and that includes the global
// settings, which is where a token or an API key would live.
streamDeck.logger.setLevel("info");

// Stream Deck takes an image as a base64 "data URI", which is the whole
// picture packed into one long string.
function asImage(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

class Playback extends SingletonAction {
  async onWillAppear(ev) {
    await ev.action.setImage(asImage(drawPlayback({ job: ev.payload.settings?.job })));
  }

  // Runs when I change the dropdown.
  async onDidReceiveSettings(ev) {
    await ev.action.setImage(asImage(drawPlayback({ job: ev.payload.settings?.job })));
  }

  async onKeyDown(ev) {
    try {
      if (!(await control(ev.payload.settings?.job))) await ev.action.showAlert();
    } catch (err) {
      streamDeck.logger.error(`Playback press failed: ${err.message}`);
      await ev.action.showAlert();
    }
  }
}

streamDeck.actions.registerAction(new (action({ UUID: "com.malikacodes.apple-music.playback" })(Playback))());

// connect() comes after the actions are registered.
streamDeck.connect();
