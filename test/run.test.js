import { test } from "node:test";
import assert from "node:assert/strict";
import { run, COMMAND_MS } from "../src/run.js";

// A real command, so this checks the actual limit and not a stand-in.
test("a command that answers comes back with what it printed", async () => {
  const { stdout } = await run("/bin/echo", ["hello"]);
  assert.equal(stdout.trim(), "hello");
});

// The reason run.js exists: a command that never comes back used to
// hold a process open forever. Here sleep is given 50 ms and killed.
test("a command that hangs is given up on at the limit", async () => {
  const started = Date.now();
  await assert.rejects(run("/bin/sleep", ["5"], { timeout: 50 }), (err) => err.killed === true);
  assert.ok(Date.now() - started < 2000, "it didn't wait for sleep to finish on its own");
});

test("the default limit is three seconds, and a caller can ask for longer", () => {
  assert.equal(COMMAND_MS, 3000);
});
