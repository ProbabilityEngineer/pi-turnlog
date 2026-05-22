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
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
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

function runTurnlog(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("turnlog", args, { stdio: ["ignore", "pipe", "pipe"] });
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

export default function (pi: ExtensionAPI) {
  pi.registerCommand("turnlog-status", {
    description: "Show turnlog status",
    handler: async (_args, ctx) => {
      await notifyResult(ctx, "turnlog status", ["status"]);
    },
  });

  pi.registerCommand("turnlog-start", {
    description: "Start a new turnlog session",
    handler: async (args, ctx) => {
      await notifyResult(ctx, "turnlog start", ["start", ...parseArgs(args)]);
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
      await notifyResult(ctx, "turnlog show", ["show", ...parseArgs(args)]);
    },
  });

  pi.registerCommand("turnlog-report", {
    description: "Print a session report",
    handler: async (args, ctx) => {
      await notifyResult(ctx, "turnlog report", ["report", ...parseArgs(args)]);
    },
  });
}
