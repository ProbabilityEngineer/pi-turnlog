import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

const ACTIONS = ["status", "init", "start", "record", "repair", "log", "grep", "show", "report", "auto"] as const;
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
type TurnlogAction = (typeof ACTIONS)[number];

type ToolParams = {
  action: TurnlogAction;
  goal?: string;
  ticket?: string;
  summary?: string;
  id?: string;
  pattern?: string;
  session?: string;
  changed?: string;
  enabled?: boolean;
  autoInit?: boolean;
  autoStart?: boolean;
  cwd?: string;
};

type ToolCtx = { cwd?: string; ui?: { notify?: (message: string, level?: "info" | "warning" | "error") => void } };

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
    "Install it with:",
    "  cargo install turnlog",
    "or set TURNLOG_BIN=/absolute/path/to/turnlog before starting Pi.",
    "Supported npm installs bundle turnlog for macOS/Linux on arm64/x64; this is a PATH fallback message.",
  ].join("\n");
}

function text(content: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: "text" as const, text: content }], details };
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
  return [stdout, stderr].filter(Boolean).join("\n") || `turnlog ${args[0]} ok`;
}

async function notifyResult(ctx: any, label: string, args: string[]) {
  const stdout = await runCli(args, ctx.cwd);
  ctx.ui.notify(`${label}:\n${stdout}`, "info");
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

async function execute(params: ToolParams, cwd?: string, lastAssistantSummary = "", setAuto?: (enabled: boolean) => boolean) {
  if (params.action === "status") return runCli(["status"], cwd);
  if (params.action === "init") return serializeMutation(cwd, async () => {
    const result = await initTurnlog(cwd);
    return [result.output, ...(result.ignored ? ["added .turnlog/ to .gitignore"] : [])].join("\n");
  });
  if (params.action === "start") return serializeMutation(cwd, async () => {
    const goal = params.goal?.trim();
    if (!goal) throw new Error("goal is required for turnlog start");
    await ensureInitialized(cwd);
    const args = ["start", "--goal", goal];
    if (params.ticket?.trim()) args.push("--ticket", params.ticket.trim());
    return runCli(args, cwd);
  });
  if (params.action === "record") return serializeMutation(cwd, async () => {
    const summary = params.summary?.trim() || lastAssistantSummary;
    if (!summary.trim()) return "No assistant summary available; nothing recorded.";
    const initialized = params.autoInit === false ? false : await ensureInitialized(cwd);
    if (!(await hasMeaningfulTurn(cwd))) return [
      ...(initialized ? ["turnlog initialized"] : []),
      "No meaningful repository change detected; nothing recorded.",
    ].join("\n");
    const started = params.autoStart === false ? undefined : await ensureActiveSession(cwd, params.goal, params.ticket);
    const recorded = await runCli(["record", "--summary", summary], cwd);
    return [
      ...(initialized ? ["turnlog initialized"] : []),
      ...(started ? [`turnlog session started:\n${started}`] : []),
      recorded,
    ].join("\n");
  });
  if (params.action === "repair") return serializeMutation(cwd, () => runCli(["repair"], cwd));
  if (params.action === "log") {
    const args = ["log"];
    if (params.session?.trim()) args.push("--session", params.session.trim());
    if (params.ticket?.trim()) args.push("--ticket", params.ticket.trim());
    if (params.pattern?.trim()) args.push("--grep", params.pattern.trim());
    if (params.changed?.trim()) args.push("--changed", params.changed.trim());
    return runCli(args, cwd);
  }
  if (params.action === "grep") {
    const pattern = params.pattern?.trim();
    if (!pattern) throw new Error("pattern is required for turnlog grep");
    return runCli(["grep", pattern], cwd);
  }
  if (params.action === "show") {
    if (!params.id?.trim()) throw new Error("id is required for turnlog show");
    return runCli(["show", params.id.trim()], cwd);
  }
  if (params.action === "report") return serializeMutation(cwd, () => {
    if (!params.id?.trim()) throw new Error("id is required for turnlog report");
    return runCli(["report", params.id.trim(), "--stdout"], cwd);
  });
  if (params.action === "auto") {
    if (!setAuto) throw new Error("auto control unavailable");
    const enabled = setAuto(params.enabled ?? true);
    return `turnlog auto-record ${enabled ? "enabled" : "disabled"}`;
  }
  return "Unknown turnlog action";
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
    recordedTurnKeys.add(messageKey);

    try {
      const stdout = await serializeMutation(ctx.cwd, () => recordIfMeaningful(ctx.cwd, summary, {
        autoInit: true,
        autoStart: true,
        goal: "Automatic Pi turn provenance",
      }));
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

  pi.registerTool({
    name: "turnlog",
    label: "Turnlog",
    description: "Compact turn/session provenance tool: status/init/start/record/repair/log/grep/show/report/auto.",
    promptSnippet: "Turnlog routing: use turnlog proactively for meaningful repository work; record only meaningful assistant turns with repository changes.",
    promptGuidelines: [
      "Use turnlog status/init/start/record/repair/log/grep/show/report/auto when the user wants durable provenance, recovery, history, or a session report.",
      "Before substantial continuation work in an initialized repo, use status; use log, grep, or show only when prior decisions, validation, or handoff context is relevant.",
      "Use turnlog proactively for meaningful repository work: code/docs/ticket changes, commits/pushes, ticket closures, multi-repo work, validation, and handoff context.",
      "Do not record routine chat-only turns.",
      "Before the final commit/push for a coherent repo change, record what changed, why, validation performed, tickets touched, and intended VCS finalization; if .turnlog/ is tracked in that repo, include those changes in the same commit.",
      "Do not record again after push unless committing that follow-up provenance record too.",
      "If record finds turnlog uninitialized, initialize it; auto-start a session for meaningful repo work unless the user forbids persistence.",
      "When the repository being changed is not Pi's current cwd, pass cwd with the target repo path so turnlog writes there.",
    ],
    parameters: Type.Object({
      action: Type.String({ enum: [...ACTIONS] as string[] }),
      cwd: Type.Optional(Type.String({ description: "Directory whose repository turnlog should be used instead of Pi's current cwd" })),
      goal: Type.Optional(Type.String()),
      ticket: Type.Optional(Type.String()),
      summary: Type.Optional(Type.String()),
      id: Type.Optional(Type.String()),
      pattern: Type.Optional(Type.String({ description: "Text for grep, or a log --grep filter" })),
      session: Type.Optional(Type.String({ description: "Session ID for a log filter" })),
      changed: Type.Optional(Type.String({ description: "Changed-file substring for a log filter" })),
      enabled: Type.Optional(Type.Boolean()),
      autoInit: Type.Optional(Type.Boolean()),
      autoStart: Type.Optional(Type.Boolean()),
    }),
    async execute(_id: string, params: ToolParams, _signal: AbortSignal, _update: unknown, ctx: ToolCtx) {
      try {
        const output = await execute(params, targetCwd(ctx.cwd, params.cwd), lastAssistantSummary, (enabled) => (autoRecordEnabled = enabled));
        return text(output, { action: params.action });
      } catch (error) {
        return text(error instanceof Error ? error.message : String(error), { code: 2 });
      }
    },
  } as any);
}
