import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

const STATUS_MAX_BYTES = 12 * 1024;
const mutationQueues = new Map<string, Promise<void>>();
const require = createRequire(import.meta.url);

function bundledTurnlogBin(): string | undefined {
  const platform = `${process.platform}-${process.arch}`;
  const packageName = ({
    "darwin-arm64": "pi-turnlog-darwin-arm64",
    "darwin-x64": "pi-turnlog-darwin-x64",
    "linux-arm64": "pi-turnlog-linux-arm64",
    "linux-x64": "pi-turnlog-linux-x64",
  } as Record<string, string>)[platform];
  if (!packageName) return undefined;
  try { return require.resolve(`${packageName}/bin/turnlog`); } catch { return undefined; }
}

function parseArgs(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: string | null = null;
  let escaped = false;

  for (const ch of input.trim()) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) args.push(current);
      current = "";
      continue;
    }
    current += ch;
  }

  if (escaped) current += "\\";
  if (current) args.push(current);
  return args;
}

function resolveTurnlogBin(): string {
  return process.env.TURNLOG_BIN?.trim() || bundledTurnlogBin() || "turnlog";
}

function missingTurnlogMessage(bin = resolveTurnlogBin()): string {
  return [
    `turnlog CLI not found: ${bin}`,
    "The optional platform package may be missing from Pi's npm lockfile.",
    "Repair it with: npm install --prefix ~/.pi/agent/npm --include=optional",
    "Alternatively set TURNLOG_BIN=/absolute/path/to/turnlog before starting Pi.",
  ].join("\n");
}



function targetCwd(cwd?: string, requested?: string): string | undefined {
  if (!requested?.trim()) return cwd;
  const raw = requested.trim();
  if (isAbsolute(raw)) return raw;
  return resolve(cwd || process.cwd(), raw);
}

function serializeMutation<T>(cwd: string | undefined, operation: () => Promise<T>): Promise<T> {
  const key = cwd || process.cwd();
  const previous = mutationQueues.get(key) || Promise.resolve();
  const result = previous.then(operation, operation);
  const settled = result.then(() => undefined, () => undefined);
  mutationQueues.set(key, settled);
  void settled.then(() => {
    if (mutationQueues.get(key) === settled) mutationQueues.delete(key);
  });
  return result;
}

function runTurnlog(args: string[], cwd?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(resolveTurnlogBin(), args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") reject(new Error(missingTurnlogMessage()));
      else reject(error);
    });
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function runCli(args: string[], cwd?: string) {
  const result = await runTurnlog(args, cwd);
  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();
  if (result.code !== 0) throw new Error(stderr || `turnlog ${args[0]} failed with exit code ${result.code}`);
  const output = [stdout, stderr].filter(Boolean).join("\n") || `turnlog ${args[0]} ok`;
  return args[0] === "status" ? boundStatusOutput(output) : output;
}

export function boundStatusOutput(value: string): string {
  if (Buffer.byteLength(value, "utf8") <= STATUS_MAX_BYTES && value.split("\n").length <= 100) return value;
  const isStatus = /^turnlog: /m.test(value);
  const notice = isStatus
    ? "\nstatus output truncated by pi-turnlog; use `turnlog status --full` outside Pi for full output."
    : "\noutput truncated by pi-turnlog; run the corresponding turnlog CLI command outside Pi for full output.";
  const budget = STATUS_MAX_BYTES - Buffer.byteLength(notice, "utf8");
  const lines = value.split(/\r?\n/);
  const essential = lines.filter(line => /^(turnlog:|current session:|last turn:|vcs:|git branch:|git head:|dirty:|changed files:|omitted paths:|jj )/.test(line));
  const selected = essential.length ? [...essential, ...lines.filter(line => line.startsWith("  - ")).slice(0, 20)] : lines.slice(0, 99);
  value = selected.map(line => {
    let end = Math.min(line.length, 512);
    while (end > 0 && (Buffer.byteLength(line.slice(0, end)) > 512 || /[\uD800-\uDBFF]$/.test(line.slice(0, end)))) end--;
    return line.slice(0, end) + (end < line.length ? "…" : "");
  }).join("\n");
  let end = Math.max(0, budget);
  while (end > 0 && Buffer.byteLength(value.slice(0, end), "utf8") > budget) end--;
  while (end > 0 && /[\uD800-\uDBFF]$/.test(value.slice(0, end))) end--;
  return `${value.slice(0, end)}${notice}`;
}

async function notifyResult(ctx: any, label: string, args: string[]) {
  const stdout = await runCli(args, ctx.cwd);
  ctx.ui.notify(boundStatusOutput(`${label}:\n${stdout}`), "info");
  return stdout;
}

function statusLines(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatCurrentStatus(stdout: string): string {
  return statusLines(stdout).slice(0, 5).join(" | ");
}

function messageText(message: any): string {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : part?.text ?? ""))
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

function summarizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 120);
}

function isDirtyStatus(stdout: string): boolean {
  return statusLines(stdout).some((line) => line === "dirty: true" || line.startsWith("changed files:"));
}

async function hasMeaningfulTurn(cwd?: string): Promise<boolean> {
  try {
    return isDirtyStatus(await runCli(["status"], cwd));
  } catch {
    return false;
  }
}

function isMissingTurnlogError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /not in an? turnlog repo|run `turnlog init`|turnlog init/i.test(message);
}

function hasActiveSession(status: string): boolean {
  return /^current session:\s+\S+/m.test(status) && !/^current session:\s*(none|\(none\))/mi.test(status);
}

async function statusOrEmpty(cwd?: string): Promise<string> {
  try { return await runCli(["status"], cwd); } catch { return ""; }
}

async function ensureTurnlogIgnored(cwd?: string): Promise<boolean> {
  if (!cwd) return false;
  const gitignorePath = join(cwd, ".gitignore");
  const raw = await readFile(gitignorePath, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  const lines = raw.split(/\r?\n/).map((line) => line.trim());
  if (lines.includes(".turnlog/") || lines.includes(".turnlog")) return false;
  const separator = raw && !raw.endsWith("\n") ? "\n" : "";
  await writeFile(gitignorePath, `${raw}${separator}.turnlog/\n`, "utf8");
  return true;
}

async function initTurnlog(cwd?: string): Promise<{ output: string; ignored: boolean }> {
  const output = await runCli(["init"], cwd);
  const ignored = await ensureTurnlogIgnored(cwd);
  return { output, ignored };
}

async function ensureInitialized(cwd?: string): Promise<boolean> {
  try {
    const status = await runCli(["status"], cwd);
    if (status.includes("turnlog: initialized")) {
      await ensureTurnlogIgnored(cwd);
      return false;
    }
  } catch (error) {
    if (!isMissingTurnlogError(error)) throw error;
  }
  await initTurnlog(cwd);
  return true;
}

async function ensureActiveSession(cwd: string | undefined, goal: string | undefined, ticket?: string): Promise<string | undefined> {
  const status = await statusOrEmpty(cwd);
  if (hasActiveSession(status)) return undefined;
  const sessionGoal = goal?.trim() || "Record repository work and continuation context";
  const args = ["start", "--goal", sessionGoal];
  if (ticket?.trim()) args.push("--ticket", ticket.trim());
  return runCli(args, cwd);
}

async function recordIfMeaningful(cwd: string | undefined, summary: string, options: { autoInit?: boolean; autoStart?: boolean; goal?: string; ticket?: string } = {}): Promise<string> {
  const cleanSummary = summary.trim();
  if (!cleanSummary) return "No assistant summary available; nothing recorded.";
  if (options.autoInit) await ensureInitialized(cwd);
  if (options.autoStart) await ensureActiveSession(cwd, options.goal, options.ticket);
  if (!(await hasMeaningfulTurn(cwd))) return "No meaningful repository change detected; nothing recorded.";
  try {
    return await runCli(["record", "--summary", cleanSummary], cwd);
  } catch (error) {
    if (options.autoInit && isMissingTurnlogError(error)) {
      await ensureInitialized(cwd);
      if (options.autoStart) await ensureActiveSession(cwd, options.goal, options.ticket);
      return runCli(["record", "--summary", cleanSummary], cwd);
    }
    throw error;
  }
}



function startArgs(raw: string): { goal?: string; ticket?: string; cwd?: string } {
  const args = parseArgs(raw);
  let goal: string | undefined;
  let ticket: string | undefined;
  let cwd: string | undefined;
  const positional: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--goal") goal = args[++i];
    else if (args[i] === "--ticket") ticket = args[++i];
    else if (args[i] === "--cwd" || args[i] === "-C") cwd = args[++i];
    else positional.push(args[i]);
  }
  if (!goal && positional.length) goal = positional.join(" ");
  return { goal, ticket, cwd };
}

function historyArgs(raw: string): { id?: string; pattern?: string; session?: string; ticket?: string; changed?: string; cwd?: string } {
  const args = parseArgs(raw);
  let id: string | undefined;
  let pattern: string | undefined;
  let session: string | undefined;
  let ticket: string | undefined;
  let changed: string | undefined;
  let cwd: string | undefined;
  const positional: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i];
    if (value === "--id") id = args[++i];
    else if (value === "--pattern" || value === "--grep") pattern = args[++i];
    else if (value === "--session") session = args[++i];
    else if (value === "--ticket") ticket = args[++i];
    else if (value === "--changed") changed = args[++i];
    else if (value === "--cwd" || value === "-C") cwd = args[++i];
    else positional.push(value);
  }
  if (!id && positional.length) id = positional.join(" ");
  if (!pattern && positional.length) pattern = positional.join(" ");
  return { id, pattern, session, ticket, changed, cwd };
}

function recordArgs(raw: string): { summary?: string; goal?: string; ticket?: string; cwd?: string; autoInit: boolean; autoStart: boolean } {
  const args = parseArgs(raw);
  let summary: string | undefined;
  let goal: string | undefined;
  let ticket: string | undefined;
  let cwd: string | undefined;
  let autoInit = true;
  let autoStart = true;
  const positional: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i];
    if (value === "--summary") summary = args[++i];
    else if (value === "--goal") goal = args[++i];
    else if (value === "--ticket") ticket = args[++i];
    else if (value === "--cwd" || value === "-C") cwd = args[++i];
    else if (value === "--auto-init") autoInit = true;
    else if (value === "--no-auto-init") autoInit = false;
    else if (value === "--auto-start") autoStart = true;
    else if (value === "--no-auto-start") autoStart = false;
    else positional.push(value);
  }
  if (!summary && positional.length) summary = positional.join(" ");
  return { summary, goal, ticket, cwd, autoInit, autoStart };
}

export default function (pi: ExtensionAPI) {
  let autoRecordEnabled = false;
  let lastAssistantSummary = "";
  const recordedTurnKeys = new Set<string>();

  pi.on("session_start", async () => {
    autoRecordEnabled = false;
    lastAssistantSummary = "";
    recordedTurnKeys.clear();
  });

  pi.on("turn_end", async (event) => {
    const summary = summarizeText(messageText((event as any).message));
    if (summary) lastAssistantSummary = summary;
  });

  pi.on("message_end", async (event, ctx) => {
    const message = (event as any).message;
    if (message?.role !== "assistant") return;

    const summary = summarizeText(messageText(message));
    if (summary) lastAssistantSummary = summary;
    if (!autoRecordEnabled || !summary) return;

    const messageKey = String(message.id ?? (event as any).turnIndex ?? summary);
    if (recordedTurnKeys.has(messageKey)) return;
    try {
      const stdout = await serializeMutation(ctx.cwd, async () => {
        if (!autoRecordEnabled || recordedTurnKeys.has(messageKey)) return "";
        const output = await recordIfMeaningful(ctx.cwd, summary, {
          autoInit: true,
          autoStart: true,
          goal: "Automatic Pi turn provenance",
        });
        recordedTurnKeys.add(messageKey);
        return output;
      });
      if (!stdout) return;
      if (stdout.startsWith("No meaningful repository change detected")) return;
      ctx.ui.notify(`turnlog auto-record:\n${stdout}`, "info");
    } catch (error) {
      ctx.ui.notify(`turnlog auto-record failed:\n${error instanceof Error ? error.message : String(error)}`, "warning");
    }
  });

  pi.registerCommand("turnlog-status", {
    description: "Show turnlog status",
    handler: async (args, ctx) => {
      const parsed = startArgs(args);
      await notifyResult({ ...ctx, cwd: targetCwd(ctx.cwd, parsed.cwd) }, "turnlog status", ["status"]);
    },
  });

  pi.registerCommand("turnlog-start", {
    description: "Initialize if needed and start a new turnlog session",
    handler: async (args, ctx) => {
      const parsed = startArgs(args);
      if (!parsed.goal) throw new Error('Usage: /turnlog-start --goal "..." [--ticket ...] [--cwd /path/to/repo]');
      const goal = parsed.goal;
      const cwd = targetCwd(ctx.cwd, parsed.cwd);
      await serializeMutation(cwd, async () => {
        const initialized = await initTurnlog(cwd);
        ctx.ui.notify(["turnlog init:", initialized.output, ...(initialized.ignored ? ["added .turnlog/ to .gitignore"] : [])].join("\n"), "info");
        const start = ["start", "--goal", goal];
        if (parsed.ticket) start.push("--ticket", parsed.ticket);
        await notifyResult({ ...ctx, cwd }, "turnlog start", start);
      });
    },
  });

  pi.registerCommand("turnlog-record", {
    description: "Record the latest assistant turn only when repository changes make it meaningful",
    handler: async (args, ctx) => {
      const parsed = recordArgs(args);
      const cwd = targetCwd(ctx.cwd, parsed.cwd);
      await serializeMutation(cwd, async () => {
        const summary = parsed.summary || lastAssistantSummary;
        const initialized = parsed.autoInit ? await ensureInitialized(cwd) : false;
        let started: string | undefined;
        let stdout: string;
        if (!summary.trim()) {
          stdout = "No assistant summary available; nothing recorded.";
        } else if (!(await hasMeaningfulTurn(cwd))) {
          stdout = "No meaningful repository change detected; nothing recorded.";
        } else {
          started = parsed.autoStart ? await ensureActiveSession(cwd, parsed.goal, parsed.ticket) : undefined;
          stdout = await runCli(["record", "--summary", summary], cwd);
        }
        ctx.ui.notify([
          "turnlog record:",
          ...(initialized ? ["turnlog initialized"] : []),
          ...(started ? [`turnlog session started:\n${started}`] : []),
          stdout,
        ].join("\n"), "info");
      });
    },
  });

  pi.registerCommand("turnlog-repair", {
    description: "Rebuild the turnlog index from canonical session and turn records",
    handler: async (args, ctx) => {
      const parsed = startArgs(args);
      const cwd = targetCwd(ctx.cwd, parsed.cwd);
      await serializeMutation(cwd, () => notifyResult({ ...ctx, cwd }, "turnlog repair", ["repair"]));
    },
  });

  pi.registerCommand("turnlog-log", {
    description: "List prior turnlog events; optionally filter by session, ticket, text, or changed file",
    handler: async (args, ctx) => {
      const parsed = historyArgs(args);
      const cwd = targetCwd(ctx.cwd, parsed.cwd);
      const command = ["log"];
      if (parsed.session) command.push("--session", parsed.session);
      if (parsed.ticket) command.push("--ticket", parsed.ticket);
      if (parsed.pattern) command.push("--grep", parsed.pattern);
      if (parsed.changed) command.push("--changed", parsed.changed);
      await notifyResult({ ...ctx, cwd }, "turnlog log", command);
    },
  });

  pi.registerCommand("turnlog-grep", {
    description: "Search prior turnlog events for text",
    handler: async (args, ctx) => {
      const parsed = historyArgs(args);
      if (!parsed.pattern) throw new Error('Usage: /turnlog-grep "..." [--cwd /path/to/repo]');
      await notifyResult({ ...ctx, cwd: targetCwd(ctx.cwd, parsed.cwd) }, "turnlog grep", ["grep", parsed.pattern]);
    },
  });

  pi.registerCommand("turnlog-show", {
    description: "Show a prior turnlog session or turn by ID",
    handler: async (args, ctx) => {
      const parsed = historyArgs(args);
      if (!parsed.id) throw new Error("Usage: /turnlog-show <session-or-turn-id> [--cwd /path/to/repo]");
      await notifyResult({ ...ctx, cwd: targetCwd(ctx.cwd, parsed.cwd) }, "turnlog show", ["show", parsed.id]);
    },
  });

  pi.registerCommand("turnlog-report", {
    description: "Generate a report for a session",
    handler: async (args, ctx) => {
      const parsed = historyArgs(args);
      if (!parsed.id) throw new Error("Usage: /turnlog-report <session-id> [--cwd /path/to/repo]");
      const cwd = targetCwd(ctx.cwd, parsed.cwd);
      await serializeMutation(cwd, () => notifyResult({ ...ctx, cwd }, "turnlog report", ["report", parsed.id!, "--stdout"]));
    },
  });

  pi.registerCommand("turnlog-auto", {
    description: "Control automatic recording: on, off, or status",
    handler: async (args, ctx) => {
      const mode = args.trim() || "status";
      if (!["on", "off", "status"].includes(mode)) {
        throw new Error("Usage: /turnlog-auto on|off|status");
      }
      if (mode !== "status") autoRecordEnabled = mode === "on";
      ctx.ui.notify(
        `turnlog auto-record ${autoRecordEnabled ? "enabled" : "disabled"} for this session (resets on reload/session change)`,
        "info",
      );
    },
  });
}
