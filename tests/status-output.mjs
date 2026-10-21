import assert from "node:assert/strict";
import { test } from "node:test";
import extension, { boundStatusOutput } from "../index.ts";
import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("registered guidance makes Turnlog opt-in, not routine finalization", () => {
  let tool;
  extension({on() {}, registerCommand() {}, registerTool(value) { tool = value; }});
  assert.match(tool.promptSnippet, /only when the user explicitly requests/);
  const guidelines = tool.promptGuidelines.join("\n");
  assert.match(guidelines, /Routine edits, renames, tests and commits do not require/);
  assert.match(guidelines, /a read request does not authorize/);
  assert.match(guidelines, /not a commit or push prerequisite/);
  assert.doesNotMatch(guidelines, /Use turnlog proactively|Before the final commit\/push/);
});

test("real tool boundary caps oversized stdout and stderr without hidden payloads", async () => {
  const dir = await mkdtemp(join(tmpdir(), "turnlog-tool-test-"));
  const old = process.env.TURNLOG_BIN;
  try {
    const executable = join(dir, "fixture");
    await writeFile(executable, `#!/bin/sh\nprintf 'turnlog: initialized\\ncurrent session: sess\\nlast turn: turn\\nvcs: git\\ngit branch: main\\ngit head: abc\\ndirty: true\\nchanged files: 30001\\n'\ni=0; while [ "$i" -lt 30001 ]; do printf '  - path-%s\\n' "$i"; i=$((i+1)); done\nprintf '%20000s' warning >&2\n`);
    await chmod(executable, 0o755);
    process.env.TURNLOG_BIN = executable;
    let tool;
    extension({on() {}, registerCommand() {}, registerTool(value) { tool = value; }});
    for (const action of ["status", "log", "grep", "show", "report"]) {
      const result = await tool.execute("test", {action, id: "fixture", pattern: "fixture"}, undefined, undefined, {cwd: dir});
      assert.ok(Buffer.byteLength(JSON.stringify(result)) < 13000);
      assert.ok(Buffer.byteLength(result.content[0].text) <= 12288);
      assert.ok(result.content[0].text.includes("git head: abc"));
      assert.ok(result.content[0].text.includes("truncated"));
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

test("ordinary output is unchanged and every tool action has a final safeguard", async () => {
  assert.equal(boundStatusOutput("turnlog: initialized\nvcs: none"), "turnlog: initialized\nvcs: none");
  let tool;
  extension({on() {}, registerCommand() {}, registerTool(value) { tool = value; }});
  const result = await tool.execute("test", {action: "show", id: "x".repeat(30000)}, undefined, undefined, {cwd: "/nonexistent-turnlog-test-directory"});
  assert.ok(Buffer.byteLength(result.content[0].text) <= 12288);
  assert.deepEqual(result.details, {code: 2});
});
