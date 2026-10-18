// Makes the Apple Music page for my Stream Deck + as a bundled profile,
// in the same format Stream Deck itself exports: a .streamDeckProfile is
// a zip of a <uuid>.sdProfile folder. The shape is copied from the same
// script in my Mac Vitals and Pomodoro plugins, which got it from a real
// export.
//
// The Home key points at my own Home profile, found on this Mac. That id
// only means something here, so the file this writes is ignored by git
// and made again with "npm run profiles".
//
// Stream Deck installs a bundled profile once, so a changed layout only
// arrives after the plugin is removed and put back (or the file is
// opened by hand).
import { mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN = "com.malikacodes.apple-music";
// The date every file inside a profile is stamped with.
const BUILT = new Date("2026-10-17T12:00:00Z");

// Stream Deck's number for the kind of deck (it goes in the plugin
// manifest), the model name it writes into its own profiles (read from
// profiles on my Mac), and the grid.
export const DEVICES = {
  plus: { type: 7, model: "20GBD9901", columns: 4, rows: 2, dials: 4 },
};

// Stream Deck's own Switch Profile action. A plugin can't open my Home
// profile (it isn't the plugin's), but this built-in key can. It gets a
// picture of its own (home.svg, next to this file): the white house, no
// words, like the Home key on all my pages.
const SWITCH_PROFILE = "com.elgato.streamdeck.profile.rotate";
const HOME_IMAGE = "home.png";

// The page. Each key is [column, row, action, settings] and each dial is
// [column, action, settings], counting from 0 at the top left.
//
// Playback on top with Home in its usual top right spot, the toggles
// underneath, and Play Playlist bottom right. It arrives with no
// playlist picked, because my playlists don't belong in a file anyone
// could read, so it says "Pick a playlist" until I set it. AirPlay, Add
// to playlist and Saved Search ship as actions but aren't on the page.
//
// home is { profile } or missing: the id of the + Home profile.
export function layouts({ home } = {}) {
  return {
    "apple-music-plus": {
      name: "Apple Music +",
      device: "plus",
      keys: [
        [0, 0, "playback", { job: "previous" }],
        [1, 0, "playback", { job: "playpause" }],
        [2, 0, "playback", { job: "next" }],
        ...(home ? [[3, 0, "home", { DeviceUUID: "", PageIndex: 1, ProfileUUID: home.profile }]] : []),
        [0, 1, "shuffle", {}],
        [1, 1, "repeat", {}],
        [2, 1, "favorite", {}],
        [3, 1, "playplaylist", {}],
      ],
      dials: [
        [0, "multimedia", {}],
        [1, "volume", {}],
        [2, "collection", { browse: "playlists" }],
        [3, "queue", {}],
      ],
    },
  };
}

// Ids made from a name, not from chance, so building twice gives the
// same ids.
function uuidFrom(name) {
  const hex = createHash("sha1").update(`apple-music:${name}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`.toUpperCase();
}

// One key or dial, the way Stream Deck writes it into a profile.
function entry(manifest, actionName, settings, id) {
  const base = { ActionID: uuidFrom(id).toLowerCase(), LinkedTitle: false, Resources: null, Settings: settings, State: 0 };
  const state = { FontFamily: "", FontSize: 12, FontStyle: "", FontUnderline: false, OutlineThickness: 2, ShowTitle: false, TitleAlignment: "bottom", TitleColor: "#ffffff" };
  if (actionName === "home") {
    return {
      ...base,
      Name: "Switch Profile",
      Plugin: { Name: "Switch Profile", UUID: SWITCH_PROFILE, Version: "1.0" },
      States: [{ ...state, Image: `Images/${HOME_IMAGE}` }],
      UUID: SWITCH_PROFILE,
    };
  }
  const action = manifest.Actions.find((a) => a.UUID === `${PLUGIN}.${actionName}`);
  if (!action) throw new Error(`No action ${actionName} in the manifest`);
  return { ...base, Name: action.Name, Plugin: { Name: manifest.Name, UUID: manifest.UUID, Version: manifest.Version }, States: [state], UUID: action.UUID };
}

// The files inside one profile, as { path: object }.
export function profileFiles(key, profile, manifest) {
  const root = `${uuidFrom(`${key}:profile`)}.sdProfile`;
  const page = uuidFrom(`${key}:page`);
  // Stream Deck's own exports carry an empty default page that isn't in
  // the page list. I do the same.
  const defaultPage = uuidFrom(`${key}:default`);
  const empty = { Controllers: [{ Actions: null, Type: "Keypad" }, { Actions: null, Type: "Encoder" }], Icon: "", Name: "" };

  const keys = {};
  for (const [column, row, actionName, settings] of profile.keys) keys[`${column},${row}`] = entry(manifest, actionName, settings, `${key}:${column},${row}`);
  const dials = {};
  for (const [column, actionName, settings] of profile.dials) dials[`${column},0`] = entry(manifest, actionName, settings, `${key}:dial:${column}`);

  return {
    [`${root}/manifest.json`]: {
      Device: { Model: DEVICES[profile.device].model, UUID: "" },
      Name: profile.name,
      Pages: { Current: page.toLowerCase(), Default: defaultPage.toLowerCase(), Pages: [page.toLowerCase()] },
      Version: "3.0",
    },
    [`${root}/Profiles/${defaultPage}/manifest.json`]: empty,
    [`${root}/Profiles/${page}/manifest.json`]: { ...empty, Controllers: [{ Actions: keys, Type: "Keypad" }, { Actions: profile.dials.length ? dials : null, Type: "Encoder" }] },
  };
}

// Finds my + Home profile among Stream Deck's own saved profiles: the
// one named "Home" for the + model. Its id is the folder's name in
// lowercase.
async function findHome() {
  const dir = join(homedir(), "Library", "Application Support", "com.elgato.StreamDeck", "ProfilesV3");
  for (const folder of await readdir(dir).catch(() => [])) {
    if (!folder.endsWith(".sdProfile")) continue;
    const saved = await readFile(join(dir, folder, "manifest.json"), "utf8").then(JSON.parse).catch(() => null);
    if (saved?.Name === "Home" && saved.Device?.Model === DEVICES.plus.model) return { profile: folder.replace(".sdProfile", "").toLowerCase() };
  }
  return undefined;
}

// Writes <dir>/<key>.streamDeckProfile for each layout.
export async function writeProfiles(dir, manifest, made) {
  await mkdir(dir, { recursive: true });
  for (const [key, profile] of Object.entries(made)) {
    const work = await mkdtemp(join(tmpdir(), "apple-music-profile-"));
    const files = profileFiles(key, profile, manifest);
    for (const [path, content] of Object.entries(files)) {
      await mkdir(join(work, path, ".."), { recursive: true });
      await writeFile(join(work, path), JSON.stringify(content));
    }
    // A key's picture lives in an Images folder beside the page it's
    // on, and has to be a PNG. sips comes with macOS and does the
    // converting.
    const pagePath = Object.keys(files).find((path) => files[path].Controllers?.[0].Actions);
    const image = join(pagePath, "..", "Images", HOME_IMAGE);
    await mkdir(join(work, image, ".."), { recursive: true });
    execFileSync("sips", ["-s", "format", "png", fileURLToPath(new URL("home.svg", import.meta.url)), "--out", join(work, image)], { stdio: "ignore" });

    // A zip remembers when each file inside it was last changed. Every
    // file gets the same made-up date, so building twice gives the same
    // file.
    for (const path of [...Object.keys(files), image]) await utimes(join(work, path), BUILT, BUILT);

    const out = join(dir, `${key}.streamDeckProfile`);
    await rm(out, { force: true });
    // Just the files, profile manifest first and no folder entries, the
    // way Stream Deck's own exports are laid out. -X leaves out extra
    // file attributes.
    execFileSync("zip", ["-q", "-X", "-D", out, ...Object.keys(files), image], { cwd: work });
    await rm(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pluginDir = join(fileURLToPath(new URL("..", import.meta.url)), `${PLUGIN}.sdPlugin`);
  const manifest = JSON.parse(await readFile(join(pluginDir, "manifest.json"), "utf8"));
  const home = await findHome();
  await writeProfiles(join(pluginDir, "profiles"), manifest, layouts({ home }));
  console.log(`Wrote ${PLUGIN}.sdPlugin/profiles`);
  console.log(`Home on the +: ${home ? "found" : "not found, so the page has no Home key"}`);
}
