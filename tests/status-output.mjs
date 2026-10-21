import assert from "node:assert/strict";
import { test } from "node:test";
import extension, { boundStatusOutput } from "../index.ts";
import { mkdtemp, writeFile, readFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("registers user commands without model tools", () => {
  const commands = {};
  extension({on() {}, registerCommand(name, value) { commands[name] = value; },
    registerTool() { assert.fail("must not register a model tool"); }});
  for (const name of ["auto", "status", "start", "record", "repair", "log", "grep", "show", "report"])
    assert.ok(commands[`turnlog-${name}`]);
});

test("real tool boundary caps oversized stdout and stderr without hidden payloads", async () => {
  const dir = await mkdtemp(join(tmpdir(), "turnlog-tool-test-"));
  const old = process.env.TURNLOG_BIN;
  try {
    const executable = join(dir, "fixture");
    await writeFile(executable, `#!/bin/sh\nprintf 'turnlog: initialized\\ncurrent session: sess\\nlast turn: turn\\nvcs: git\\ngit branch: main\\ngit head: abc\\ndirty: true\\nchanged files: 30001\\n'\ni=0; while [ "$i" -lt 30001 ]; do printf '  - path-%s\\n' "$i"; i=$((i+1)); done\nprintf '%20000s' warning >&2\n`);
    await chmod(executable, 0o755);
    process.env.TURNLOG_BIN = executable;
    const commands = {};
    extension({on() {}, registerCommand(name, value) { commands[name] = value; }});
    for (const action of ["status", "log", "grep", "show", "report"]) {
      let result;
      await commands[`turnlog-${action}`].handler("fixture", {cwd: dir, ui: {notify(value) { result = value; }}});
      assert.ok(Buffer.byteLength(result) < 13000);
      assert.ok(result.includes("git head: abc"));
      assert.ok(result.includes("truncated"));
    }
  } finally {
    if (old === undefined) delete process.env.TURNLOG_BIN; else process.env.TURNLOG_BIN = old;
    await rm(dir, {recursive: true});
  }
});

test("bounded UTF-8 status preserves essential fields after huge summaries", () => {
  const payload = "turnlog: initialized\ncurrent session: sess goal=" + "😀".repeat(30000)
    + "\nlast turn: turn_test\nvcs: git\ngit branch: main\ngit head: abc\ndirty: true\nchanged files: 30001\n"
    + Array.from({length: 30001}, (_, n) => `  - 研究/${n}`).join("\n");
  const output = boundStatusOutput(payload);
  assert.ok(Buffer.byteLength(output) <= 12288);
  assert.ok(output.split("\n").length <= 100);
  assert.ok(output.includes("git head: abc"));
  assert.ok(output.includes("last turn: turn_test"));
  assert.ok(output.includes("truncated"));
  assert.ok(!output.includes("\uFFFD"));
});

test("ordinary output is unchanged", async () => {
  assert.equal(boundStatusOutput("turnlog: initialized\nvcs: none"), "turnlog: initialized\nvcs: none");
});

test("auto control defaults off, rejects invalid input, and resets on session change", async () => {
  const commands = {}, hooks = {};
  extension({on(name, fn) { hooks[name] = fn; }, registerCommand(name, value) { commands[name] = value; }});
  let output;
  const ctx = {cwd: "/nonexistent-turnlog-test-directory", ui: {notify(value) { output = value; }}};
  await commands["turnlog-auto"].handler("", ctx);
  assert.match(output, /disabled/);
  await hooks.message_end({message: {role: "assistant", content: [{type: "text", text: "hello"}]}}, ctx);
  assert.match(output, /disabled/);
  await commands["turnlog-auto"].handler("on", ctx);
  assert.match(output, /enabled/);
  await assert.rejects(commands["turnlog-auto"].handler("maybe", ctx), /Usage/);
  await hooks.session_start();
  await commands["turnlog-auto"].handler("status", ctx);
  assert.match(output, /disabled/);
});

test("enabled hook records without model calls, deduplicates, and stops when disabled", async () => {
  const dir = await mkdtemp(join(tmpdir(), "turnlog-hooks-"));
  const old = process.env.TURNLOG_BIN;
  try {
    const executable = join(dir, "fixture");
    await writeFile(executable, `#!/bin/sh
if [ "$1" = record ]; then echo recorded >> calls; echo recorded; else
printf 'turnlog: initialized\\ncurrent session: sess\\ndirty: true\\n'
fi
`);
    await chmod(executable, 0o755);
    process.env.TURNLOG_BIN = executable;
    const commands = {}, hooks = {};
    extension({on(name, fn) { hooks[name] = fn; }, registerCommand(name, value) { commands[name] = value; }});
    const ctx = {cwd: dir, ui: {notify() {}}};
    const event = {message: {id: "one", role: "assistant", content: [{type: "text", text: "Updated code"}]}};
    await commands["turnlog-auto"].handler("on", ctx);
    await hooks.message_end(event, ctx);
    await hooks.message_end(event, ctx);
    assert.equal(await readFile(join(dir, "calls"), "utf8"), "recorded\n");
    await commands["turnlog-auto"].handler("off", ctx);
    await hooks.message_end({...event, message: {...event.message, id: "two"}}, ctx);
    assert.equal(await readFile(join(dir, "calls"), "utf8"), "recorded\n");
  } finally {
    if (old === undefined) delete process.env.TURNLOG_BIN; else process.env.TURNLOG_BIN = old;
    await rm(dir, {recursive: true});
  }
});
