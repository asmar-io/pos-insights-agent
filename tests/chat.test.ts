// Tests for the pure helpers in the chat REPL. The chatTurn/generateText
// path is exercised by the CLI at runtime — it needs a real model.

import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";
import { parseCommand, renderTranscript } from "../src/agent/chat.js";

describe("parseCommand", () => {
  it("treats blank input as empty", () => {
    expect(parseCommand("").kind).toBe("empty");
    expect(parseCommand("   ").kind).toBe("empty");
  });

  it("recognises /exit and /quit", () => {
    expect(parseCommand("/exit").kind).toBe("exit");
    expect(parseCommand("/quit").kind).toBe("exit");
    expect(parseCommand("  /exit  ").kind).toBe("exit");
  });

  it("recognises /help and /reset", () => {
    expect(parseCommand("/help").kind).toBe("help");
    expect(parseCommand("/reset").kind).toBe("reset");
  });

  it("parses /save <path>", () => {
    const cmd = parseCommand("/save transcript.md");
    expect(cmd.kind).toBe("save");
    if (cmd.kind === "save") expect(cmd.path).toBe("transcript.md");
  });

  it("flags /save with no path as invalid", () => {
    const cmd = parseCommand("/save");
    expect(cmd.kind).toBe("invalid");
  });

  it("flags unknown slash commands as invalid", () => {
    const cmd = parseCommand("/nope");
    expect(cmd.kind).toBe("invalid");
    if (cmd.kind === "invalid") expect(cmd.error).toMatch(/unknown/);
  });

  it("treats plain text as a message", () => {
    const cmd = parseCommand("why baklava?");
    expect(cmd.kind).toBe("message");
    if (cmd.kind === "message") expect(cmd.text).toBe("why baklava?");
  });
});

describe("renderTranscript", () => {
  it("renders alternating owner/analyst sections in order", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "why baklava?" },
      { role: "assistant", content: "88% margin, ~3 units/week — under-promoted." },
      { role: "user", content: "sim +15%" },
      { role: "assistant", content: "Revenue would grow ~5%." },
    ];
    const md = renderTranscript(messages);
    expect(md).toContain("# Chat transcript");
    expect(md).toContain("### owner");
    expect(md).toContain("### analyst");
    expect(md.indexOf("why baklava?")).toBeLessThan(md.indexOf("88% margin"));
    expect(md.indexOf("88% margin")).toBeLessThan(md.indexOf("sim +15%"));
  });

  it("skips non-string content (tool messages) in the transcript", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "check margin on tagine" },
      // A tool message won't render as a transcript line.
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "margin_calc",
            output: { type: "json", value: { margin: 42 } },
          },
        ],
      },
      { role: "assistant", content: "Margin is 42%." },
    ];
    const md = renderTranscript(messages);
    expect(md).toContain("check margin on tagine");
    expect(md).toContain("Margin is 42%.");
    expect(md).not.toContain("tool-result");
  });
});
