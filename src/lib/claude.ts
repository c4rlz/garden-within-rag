import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5-5";
const EFFORT = "medium";

export type Backend = "claude-code" | "api";

export function backend(): Backend {
  const value = process.env.CLAUDE_BACKEND ?? "claude-code";
  if (value !== "claude-code" && value !== "api") {
    throw new Error(`CLAUDE_BACKEND must be "claude-code" or "api", not "${value}".`);
  }
  return value;
}

// Sends one prompt to Claude and returns the text of its reply.
export function complete(system: string, prompt: string): Promise<string> {
  return backend() === "api" ? completeWithApi(system, prompt) : completeWithClaudeCode(system, prompt);
}

// Runs the local Claude Code CLI headlessly, so answers use your Claude Code
// login instead of an API key. It gets no tools, no MCP servers and no saved
// session: it only reads the entries in the prompt, and they aren't kept in
// your Claude Code history.
function completeWithClaudeCode(system: string, prompt: string): Promise<string> {
  const args = [
    "-p",
    "--output-format", "json",
    "--model", MODEL,
    "--effort", EFFORT,
    "--system-prompt", system,
    "--tools", "",
    "--strict-mcp-config",
    "--disable-slash-commands",
    "--no-session-persistence",
  ];

  return new Promise((resolve, reject) => {
    // Claude Code prefers an API key over your login, so don't pass one through.
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
    // Run outside the repo so no project CLAUDE.md is picked up.
    const child = spawn("claude", args, { cwd: tmpdir(), env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (err: NodeJS.ErrnoException) => {
      reject(
        err.code === "ENOENT"
          ? new Error("Claude Code isn't installed or not on your PATH. Install it, or set CLAUDE_BACKEND=api.")
          : err,
      );
    });
    child.on("close", (code) => {
      let parsed: { result?: string; is_error?: boolean } | undefined;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        // Fall through to the error below.
      }
      if (code !== 0 || !parsed || parsed.is_error || typeof parsed.result !== "string") {
        const detail = (parsed?.result ?? stderr ?? stdout).trim().slice(0, 1000);
        reject(new Error(`Claude Code didn't answer (exit ${code}).\n${detail}`));
        return;
      }
      resolve(parsed.result.trim());
    });
    // The prompt goes in on stdin so a long run of entries isn't limited by argv size.
    child.stdin.end(prompt);
  });
}

async function completeWithApi(system: string, prompt: string): Promise<string> {
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: EFFORT },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    messages: [{ role: "user", content: prompt }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`Claude declined to answer (${response.stop_details?.category ?? "no category"}).`);
  }

  return response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();
}
