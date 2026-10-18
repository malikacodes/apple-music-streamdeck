// Runs one of the Mac's commands and gives back what it printed.
//
// Every command gets a time limit. A command that never comes back
// (a network tool while the Wi-Fi is switching, a helper that's stuck)
// would otherwise hold a process open forever, and the next tick would
// start another. Three seconds is plenty for a reading. A caller that
// really needs longer says so in its options.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const COMMAND_MS = 3000;

const exec = promisify(execFile);

export const run = (file, args = [], options = {}) => exec(file, args, { timeout: COMMAND_MS, ...options });
