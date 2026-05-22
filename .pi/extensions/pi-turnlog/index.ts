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
  return new Error(`turnlog: ${message}`);
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

async function notifyResult(ctx: Parameters<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>[1], label: string, args: string[]) {
  const result = await runTurnlog(args);
  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();
  if (stdout) ctx.ui.notify(`${label}:\n${stdout}`, "info");
  if (stderr) ctx.ui.notify(`${label} stderr:\n${stderr}`, "warning");
  if (result.code !== 0) throw new Error(`${label} failed with exit code ${result.code}`);
}

function requireOneArg(raw: string, cmd: string): string {
  const args = parseArgs(raw);
  if (args.length !== 1) throw usageError(`${cmd} requires exactly one ID`);
  return args[0];
}

function requireAtLeastOneArg(raw: string, cmd: string): string[] {
  const args = parseArgs(raw);
  if (!args.length) throw usageError(`${cmd} requires arguments`);
  return args;
}

export default function (pi: ExtensionAPI) {
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

  pi.registerCommand("turnlog-start", {
    description: "Start a new turnlog session",
    handler: async (args, ctx) => {
      const parsed = requireAtLeastOneArg(args, "turnlog start");
      await notifyResult(ctx, "turnlog start", ["start", ...parsed]);
    },
  });

  pi.registerCommand("turnlog-record", {
    description: "Record a turnlog turn",
    handler: async (args, ctx) => {
      await notifyResult(ctx, "turnlog record", ["record", ...parseArgs(args)]);
    },
  });

  pi.registerCommand("turnlog-show", {
    description: "Show a session or turn",
    handler: async (args, ctx) => {
      const id = requireOneArg(args, "turnlog show");
      await notifyResult(ctx, "turnlog show", ["show", id]);
    },
  });

  pi.registerCommand("turnlog-report", {
    description: "Print a session report",
    handler: async (args, ctx) => {
      const id = requireOneArg(args, "turnlog report");
      await notifyResult(ctx, "turnlog report", ["report", id]);
    },
  });
}
