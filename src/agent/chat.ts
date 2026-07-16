// Stateful chat REPL — the follow-up mode for the weekly brief.
//
// generateWeeklyBrief is one-shot: prompt in, markdown out. The chat
// agent shares the same tools + system prompt but keeps message history
// across turns, so the owner can ask "why baklava?" or "sim +15% on the
// Grand tagine" and the model reuses what it already knows.
//
// The REPL loop lives in runChat(). The pure turn function is exported
// separately so tests can drive it with a mocked model without needing
// stdin or API keys.

import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import type { LanguageModel, ModelMessage } from "ai";
import { generateText, stepCountIs } from "ai";
import { createAdapter } from "../adapters/sqlite.js";
import { assertKeyAvailable, getModel, getModelId } from "../models/index.js";
import { createTools } from "../tools/index.js";
import { generateWeeklyBrief } from "./weekly_brief.js";

const CHAT_SYSTEM_PROMPT = `You are a CFO-caliber restaurant analyst answering follow-up questions from the owner about the weekly menu-profitability brief.
Rules:
- Ground every number in a tool call — never invent figures.
- Prefer 'effective' costs over 'reported' ones; the gap is the point.
- Currency is Moroccan Dirham (MAD). Use "MAD" as the symbol.
- Be terse — one owner-friendly paragraph unless a table or list is clearly better.
- If a question can't be answered with the available tools, say so plainly and suggest what data would answer it.`;

const HELP_TEXT = [
  "Commands:",
  "  /help          show this help",
  "  /reset         forget the conversation (keeps the initial brief if it was generated)",
  "  /save <path>   write the current transcript to a markdown file",
  "  /exit          leave the chat",
].join("\n");

export type ChatOptions = {
  dbPath: string;
  tenantId: string;
  storeId: string;
  anchorIso?: string;
  skipBrief?: boolean;
};

export type ChatSessionOptions = {
  tools: ReturnType<typeof createTools>;
  model: LanguageModel;
  maxSteps?: number;
};

/** One user turn: append a user message, call the model, return the new
 *  history + the assistant text. Pure — no IO, no readline. */
export async function chatTurn(
  messages: ModelMessage[],
  userInput: string,
  session: ChatSessionOptions,
): Promise<{ messages: ModelMessage[]; text: string }> {
  const withUser: ModelMessage[] = [...messages, { role: "user", content: userInput }];
  const { text, responseMessages } = await generateText({
    model: session.model,
    system: CHAT_SYSTEM_PROMPT,
    messages: withUser,
    tools: session.tools,
    stopWhen: stepCountIs(session.maxSteps ?? 8),
    temperature: 0.3,
  });
  return {
    messages: [...withUser, ...responseMessages],
    text: text.trim(),
  };
}

export async function runChat(opts: ChatOptions): Promise<void> {
  assertKeyAvailable();

  const adapter = createAdapter({
    dbPath: opts.dbPath,
    tenantId: opts.tenantId,
    storeId: opts.storeId,
  });

  try {
    const anchorIso = opts.anchorIso ?? adapter.maxOrderDate();
    if (!anchorIso) {
      throw new Error("No completed orders found in the fixture — cannot anchor the chat.");
    }

    const tools = createTools({ adapter, anchorIso });
    const model = getModel();
    const modelId = getModelId();

    console.log(`> model: ${modelId}`);
    console.log(`> anchor: ${anchorIso}`);
    console.log("> type /help for commands, /exit to leave");
    console.log("");

    let messages: ModelMessage[] = [];

    if (!opts.skipBrief) {
      console.log("> generating the weekly brief first…");
      const brief = await generateWeeklyBrief({
        dbPath: opts.dbPath,
        tenantId: opts.tenantId,
        storeId: opts.storeId,
        anchorIso,
      });
      // Seed the conversation with the initial brief as an assistant turn.
      // The user "turn 0" is a stand-in that mirrors the drafter's prompt
      // so the model has valid context for follow-ups.
      messages = [
        { role: "user", content: "Produce this week's Menu Profitability Brief." },
        { role: "assistant", content: brief.markdown },
      ];
      console.log("");
      console.log(brief.markdown);
      console.log("");
    }

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string): Promise<string> => new Promise((resolve) => rl.question(q, resolve));

    const session: ChatSessionOptions = { tools, model };

    while (true) {
      const raw = await ask("owner> ");
      const cmd = parseCommand(raw);

      if (cmd.kind === "empty") continue;
      if (cmd.kind === "exit") break;
      if (cmd.kind === "help") {
        console.log(HELP_TEXT);
        continue;
      }
      if (cmd.kind === "reset") {
        messages = [];
        console.log("> conversation cleared");
        continue;
      }
      if (cmd.kind === "invalid") {
        console.log(`> ${cmd.error}`);
        continue;
      }
      if (cmd.kind === "save") {
        writeFileSync(cmd.path, renderTranscript(messages), "utf8");
        console.log(`> wrote ${cmd.path}`);
        continue;
      }

      try {
        const turn = await chatTurn(messages, cmd.text, session);
        messages = turn.messages;
        console.log("");
        console.log(turn.text);
        console.log("");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`ERROR: ${msg}`);
      }
    }

    rl.close();
  } finally {
    adapter.close();
  }
}

export type ParsedCommand =
  | { kind: "empty" }
  | { kind: "exit" }
  | { kind: "help" }
  | { kind: "reset" }
  | { kind: "save"; path: string }
  | { kind: "invalid"; error: string }
  | { kind: "message"; text: string };

export function parseCommand(raw: string): ParsedCommand {
  const trimmed = raw.trim();
  if (trimmed === "") return { kind: "empty" };
  if (trimmed === "/exit" || trimmed === "/quit") return { kind: "exit" };
  if (trimmed === "/help") return { kind: "help" };
  if (trimmed === "/reset") return { kind: "reset" };
  if (trimmed.startsWith("/save")) {
    const path = trimmed.slice(5).trim();
    if (!path) return { kind: "invalid", error: "usage: /save <path>" };
    return { kind: "save", path };
  }
  if (trimmed.startsWith("/")) {
    return { kind: "invalid", error: `unknown command: ${trimmed.split(/\s+/)[0]}` };
  }
  return { kind: "message", text: trimmed };
}

export function renderTranscript(messages: ModelMessage[]): string {
  const lines: string[] = ["# Chat transcript", ""];
  for (const m of messages) {
    if (m.role === "user" && typeof m.content === "string") {
      lines.push("### owner", "", m.content, "");
    } else if (m.role === "assistant" && typeof m.content === "string") {
      lines.push("### analyst", "", m.content, "");
    }
  }
  return lines.join("\n");
}
