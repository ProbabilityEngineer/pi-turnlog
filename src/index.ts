import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawn } from "node:child_process";

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

function usageError(message: string): Error {
  return new Error(message);
}

function resolveTurnlogBin(): string {
  return process.env.TURNLOG_BIN?.trim() || "turnlog";
}

function runTurnlog(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(resolveTurnlogBin(), args, { stdio: ["ignore", "pipe", "pipe"] });
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

async function notifyResult(ctx: any, label: string, args: string[]) {
  const result = await runTurnlog(args);
  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();
  if (stdout) ctx.ui.notify(`${label}:\n${stdout}`, "info");
  if (stderr) ctx.ui.notify(`${label} stderr:\n${stderr}`, "warning");
  if (result.code !== 0) throw new Error(`${label} failed with exit code ${result.code}`);
  return stdout;
}

function requireOneArg(raw: string, cmd: string): string {
  const args = parseArgs(raw);
  if (args.length !== 1) throw usageError(`Usage: /${cmd} <id>`);
  return args[0];
}

function requireAtLeastOneArg(raw: string, cmd: string): string[] {
  const args = parseArgs(raw);
  if (!args.length) throw usageError(`Usage: /${cmd} --goal "..." [--ticket ...]`);
  return args;
}

function statusLines(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatCurrentStatus(stdout: string): string {
  return statusLines(stdout).slice(0, 4).join(" | ");
}

function formatContext(stdout: string): string {
  const lines = statusLines(stdout);
  const session = lines.find((line) => line.startsWith("current session:")) ?? "current session: none";
  const turn = lines.find((line) => line.startsWith("last turn:")) ?? "last turn: none";
  const vcs = lines.find((line) => line.startsWith("vcs:")) ?? "vcs: unknown";
  const dirty = lines.find((line) => line.startsWith("dirty:"));
  return [session, turn, dirty ? `${vcs} ${dirty}` : vcs].join("\n");
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

function summarizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 120);
}

async function buildRecordArgs(raw: string, ctx: any, suggestedSummary?: string): Promise<string[] | null> {
  const args = parseArgs(raw);
  if (args.length) return args;

  const summary = (suggestedSummary
    ? await ctx.ui.editor("Record turn summary", suggestedSummary)
    : await ctx.ui.input("Record turn summary", "what changed?"))?.trim();
  if (!summary) {
    ctx.ui.notify("turnlog record cancelled", "info");
    return null;
  }
  return ["--summary", summary];
}

export default function (pi: ExtensionAPI) {
  let footerEnabled = false;
  let autoRecordEnabled = false;
  let lastAssistantSummary = "";
  const recordedTurnKeys = new Set<string>();

  pi.on("turn_end", async (event, ctx) => {
    const text = messageText((event as any).message);
    const summary = summarizeText(text);
    if (summary) lastAssistantSummary = summary;

    if (!autoRecordEnabled || !summary) return;
    const turnKey = String((event as any).turnIndex ?? summary);
    if (recordedTurnKeys.has(turnKey)) return;
    recordedTurnKeys.add(turnKey);

    const result = await runTurnlog(["record", "--summary", summary]);
    if (result.code === 0) {
      const stdout = result.stdout.trim();
      if (stdout) ctx.ui.notify(`turnlog auto-record:\n${stdout}`, "info");
    } else {
      const stderr = result.stderr.trim() || `exit code ${result.code}`;
      ctx.ui.notify(`turnlog auto-record failed:\n${stderr}`, "warning");
    }
  });

  pi.on("message_end", async (event) => {
    if ((event as any).message?.role !== "assistant") return;
    const summary = summarizeText(messageText((event as any).message));
    if (summary) lastAssistantSummary = summary;
  });

  pi.on("session_start", async (_event, ctx) => {
    if (!footerEnabled) return;
    try {
      const stdout = await notifyResult(ctx, "turnlog status", ["status"]);
      const summary = formatCurrentStatus(stdout);
      if (summary) ctx.ui.setStatus("turnlog", summary);
    } catch {
      // best effort only
    }
  });

  pi.registerCommand("turnlog-init", {
    description: "Initialize turnlog storage",
    handler: async (_args, ctx) => {
      await notifyResult(ctx, "turnlog init", ["init"]);
    },
  });

  pi.registerCommand("turnlog-status", {
    description: "Show turnlog status",
    handler: async (_args, ctx) => {
      await notifyResult(ctx, "turnlog status", ["status"]);
    },
  });

  pi.registerCommand("turnlog-current", {
    description: "Show current turnlog session and last turn",
    handler: async (_args, ctx) => {
      await notifyResult(ctx, "turnlog current", ["status"]);
    },
  });

  pi.registerCommand("turnlog-context", {
    description: "Show concise turnlog context",
    handler: async (_args, ctx) => {
      const stdout = await notifyResult(ctx, "turnlog context", ["status"]);
      const summary = formatContext(stdout);
      if (summary) ctx.ui.notify(`turnlog context:\n${summary}`, "info");
    },
  });

  pi.registerCommand("turnlog-footer", {
    description: "Toggle the turnlog status footer",
    handler: async (_args, ctx) => {
      footerEnabled = !footerEnabled;
      ctx.ui.notify(`turnlog footer ${footerEnabled ? "enabled" : "disabled"}`, "info");
      if (footerEnabled) {
        try {
          const stdout = await notifyResult(ctx, "turnlog status", ["status"]);
          const summary = formatCurrentStatus(stdout);
          if (summary) ctx.ui.setStatus("turnlog", summary);
        } catch {
          // best effort only
        }
      } else {
        ctx.ui.setStatus("turnlog", "");
      }
    },
  });

  pi.registerCommand("turnlog-auto", {
    description: "Toggle automatic turnlog recording for assistant turns",
    handler: async (_args, ctx) => {
      autoRecordEnabled = !autoRecordEnabled;
      ctx.ui.notify(`turnlog auto-record ${autoRecordEnabled ? "enabled" : "disabled"}`, "info");
    },
  });

  pi.registerCommand("turnlog-start", {
    description: "Start a new turnlog session",
    handler: async (args, ctx) => {
      const parsed = requireAtLeastOneArg(args, "turnlog-start");
      await notifyResult(ctx, "turnlog start", ["start", ...parsed]);
    },
  });

  pi.registerCommand("turnlog-record", {
    description: "Record a turnlog turn",
    handler: async (args, ctx) => {
      const recordArgs = await buildRecordArgs(args, ctx);
      if (!recordArgs) return;
      await notifyResult(ctx, "turnlog record", ["record", ...recordArgs]);
    },
  });

  pi.registerCommand("turnlog-record-turn", {
    description: "Record the latest assistant turn with an editable suggested summary",
    handler: async (args, ctx) => {
      const recordArgs = await buildRecordArgs(args, ctx, lastAssistantSummary);
      if (!recordArgs) return;
      await notifyResult(ctx, "turnlog record", ["record", ...recordArgs]);
    },
  });

  pi.registerCommand("turnlog-show", {
    description: "Show a session or turn",
    handler: async (args, ctx) => {
      const id = requireOneArg(args, "turnlog-show");
      await notifyResult(ctx, "turnlog show", ["show", id]);
    },
  });

  pi.registerCommand("turnlog-report", {
    description: "Print a session report",
    handler: async (args, ctx) => {
      const id = requireOneArg(args, "turnlog-report");
      await notifyResult(ctx, "turnlog report", ["report", id]);
    },
  });
}
