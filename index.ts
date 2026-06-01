import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { spawn } from "node:child_process";

const ACTIONS = ["status", "init", "start", "record", "report", "auto"] as const;
type TurnlogAction = (typeof ACTIONS)[number];

type ToolParams = {
  action: TurnlogAction;
  goal?: string;
  ticket?: string;
  summary?: string;
  id?: string;
  enabled?: boolean;
  autoInit?: boolean;
  autoStart?: boolean;
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
  return process.env.TURNLOG_BIN?.trim() || "turnlog";
}

function text(content: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: "text" as const, text: content }], details };
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
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function runCli(args: string[], cwd?: string) {
  const result = await runTurnlog(args, cwd);
  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();
  if (result.code !== 0) throw new Error(stderr || `turnlog ${args[0]} failed with exit code ${result.code}`);
  return stdout || stderr || `turnlog ${args[0]} ok`;
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

async function ensureInitialized(cwd?: string): Promise<boolean> {
  try {
    const status = await runCli(["status"], cwd);
    if (status.includes("turnlog: initialized")) return false;
  } catch (error) {
    if (!isMissingTurnlogError(error)) throw error;
  }
  await runCli(["init"], cwd);
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
  if (params.action === "init") return runCli(["init"], cwd);
  if (params.action === "start") {
    const goal = params.goal?.trim();
    if (!goal) throw new Error("goal is required for turnlog start");
    await ensureInitialized(cwd);
    const args = ["start", "--goal", goal];
    if (params.ticket?.trim()) args.push("--ticket", params.ticket.trim());
    return runCli(args, cwd);
  }
  if (params.action === "record") {
    const initialized = params.autoInit ? await ensureInitialized(cwd) : false;
    const started = params.autoStart ? await ensureActiveSession(cwd, params.goal, params.ticket) : undefined;
    const recorded = await recordIfMeaningful(cwd, params.summary?.trim() || lastAssistantSummary, { autoInit: false, autoStart: false });
    return [
      ...(initialized ? ["turnlog initialized"] : []),
      ...(started ? [`turnlog session started:\n${started}`] : []),
      recorded,
    ].join("\n");
  }
  if (params.action === "report") {
    if (!params.id?.trim()) throw new Error("id is required for turnlog report");
    return runCli(["report", params.id.trim(), "--stdout"], cwd);
  }
  if (params.action === "auto") {
    if (!setAuto) throw new Error("auto control unavailable");
    const enabled = setAuto(params.enabled ?? true);
    return `turnlog auto-record ${enabled ? "enabled" : "disabled"}`;
  }
  return "Unknown turnlog action";
}

function startArgs(raw: string): { goal?: string; ticket?: string } {
  const args = parseArgs(raw);
  let goal: string | undefined;
  let ticket: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--goal") goal = args[++i];
    else if (args[i] === "--ticket") ticket = args[++i];
  }
  if (!goal && args.length) goal = args.join(" ");
  return { goal, ticket };
}

function recordArgs(raw: string): { summary?: string; goal?: string; ticket?: string; autoInit: boolean; autoStart: boolean } {
  const args = parseArgs(raw);
  let summary: string | undefined;
  let goal: string | undefined;
  let ticket: string | undefined;
  let autoInit = false;
  let autoStart = false;
  const positional: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i];
    if (value === "--summary") summary = args[++i];
    else if (value === "--goal") goal = args[++i];
    else if (value === "--ticket") ticket = args[++i];
    else if (value === "--auto-init") autoInit = true;
    else if (value === "--auto-start") autoStart = true;
    else positional.push(value);
  }
  if (!summary && positional.length) summary = positional.join(" ");
  return { summary, goal, ticket, autoInit, autoStart };
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
    if (!(await hasMeaningfulTurn(ctx.cwd))) return;

    const messageKey = String(message.id ?? (event as any).turnIndex ?? summary);
    if (recordedTurnKeys.has(messageKey)) return;
    recordedTurnKeys.add(messageKey);

    try {
      const stdout = await runCli(["record", "--summary", summary], ctx.cwd);
      ctx.ui.notify(`turnlog auto-record:\n${stdout}`, "info");
    } catch (error) {
      ctx.ui.notify(`turnlog auto-record failed:\n${error instanceof Error ? error.message : String(error)}`, "warning");
    }
  });

  pi.registerCommand("turnlog-status", {
    description: "Show turnlog status",
    handler: async (_args, ctx) => {
      await notifyResult(ctx, "turnlog status", ["status"]);
    },
  });

  pi.registerCommand("turnlog-start", {
    description: "Initialize if needed and start a new turnlog session",
    handler: async (args, ctx) => {
      const parsed = startArgs(args);
      if (!parsed.goal) throw new Error('Usage: /turnlog-start --goal "..." [--ticket ...]');
      await notifyResult(ctx, "turnlog init", ["init"]);
      const start = ["start", "--goal", parsed.goal];
      if (parsed.ticket) start.push("--ticket", parsed.ticket);
      await notifyResult(ctx, "turnlog start", start);
    },
  });

  pi.registerCommand("turnlog-record", {
    description: "Record the latest assistant turn only when repository changes make it meaningful",
    handler: async (args, ctx) => {
      const parsed = recordArgs(args);
      const initialized = parsed.autoInit ? await ensureInitialized(ctx.cwd) : false;
      const started = parsed.autoStart ? await ensureActiveSession(ctx.cwd, parsed.goal, parsed.ticket) : undefined;
      const stdout = await recordIfMeaningful(ctx.cwd, parsed.summary || lastAssistantSummary, { autoInit: false, autoStart: false });
      ctx.ui.notify([
        "turnlog record:",
        ...(initialized ? ["turnlog initialized"] : []),
        ...(started ? [`turnlog session started:\n${started}`] : []),
        stdout,
      ].join("\n"), "info");
    },
  });

  pi.registerTool({
    name: "turnlog",
    label: "Turnlog",
    description: "Compact turn/session provenance tool: status/init/start/record/report/auto.",
    promptSnippet: "Turnlog routing: use turnlog for explicit session/turn provenance; record only meaningful assistant turns with repository changes.",
    promptGuidelines: [
      "Use turnlog status/init/start/record/report/auto when the user wants durable provenance or handoff records.",
      "Do not auto-record chat-only turns; turnlog record should capture meaningful assistant turns with repository changes.",
    ],
    parameters: Type.Object({
      action: Type.String({ enum: [...ACTIONS] as string[] }),
      goal: Type.Optional(Type.String()),
      ticket: Type.Optional(Type.String()),
      summary: Type.Optional(Type.String()),
      id: Type.Optional(Type.String()),
      enabled: Type.Optional(Type.Boolean()),
      autoInit: Type.Optional(Type.Boolean()),
      autoStart: Type.Optional(Type.Boolean()),
    }),
    async execute(_id: string, params: ToolParams, _signal: AbortSignal, _update: unknown, ctx: ToolCtx) {
      try {
        const output = await execute(params, ctx.cwd, lastAssistantSummary, (enabled) => (autoRecordEnabled = enabled));
        return text(output, { action: params.action });
      } catch (error) {
        return text(error instanceof Error ? error.message : String(error), { code: 2 });
      }
    },
  } as any);
}
