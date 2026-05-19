import { describe, it, expect, vi } from "vitest";
import { chatWithTools } from "../inference.js";
import type { ToolHandler } from "../inference.js";
import type { ChatCompletionTool, ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";

/**
 * Creates a mock OpenAI client that returns pre-scripted responses.
 * Each call to chat.completions.create pops the next response from the queue.
 */
function createMockLLM(responses: Array<{
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}>) {
  let callIndex = 0;
  const create = vi.fn().mockImplementation(async () => {
    const resp = responses[callIndex++];
    if (!resp) throw new Error("Mock LLM ran out of scripted responses");
    return {
      choices: [{
        message: {
          role: "assistant",
          content: resp.content ?? null,
          tool_calls: resp.tool_calls ?? undefined,
        },
        finish_reason: resp.tool_calls ? "tool_calls" : "stop",
      }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    };
  });
  return { chat: { completions: { create } }, _create: create };
}

const sampleTools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get weather for a city",
      parameters: {
        type: "object",
        properties: { city: { type: "string" } },
        required: ["city"],
      },
    },
  },
];

describe("chatWithTools integration", () => {
  it("returns direct text response when no tools are called", async () => {
    const llm = createMockLLM([
      { content: "Hello! The weather is nice." },
    ]);
    const messages: ChatCompletionMessageParam[] = [
      { role: "user", content: "What's the weather?" },
    ];
    const handler: ToolHandler = vi.fn();

    const result = await chatWithTools(llm as any, messages, sampleTools, handler, "gpt-4", 5);

    expect(result).toBe("Hello! The weather is nice.");
    expect(handler).not.toHaveBeenCalled();
    expect(llm._create).toHaveBeenCalledTimes(1);
  });

  it("executes tool calls and feeds results back to the LLM", async () => {
    const llm = createMockLLM([
      {
        tool_calls: [{
          id: "call_1",
          type: "function",
          function: { name: "get_weather", arguments: '{"city":"Tel Aviv"}' },
        }],
      },
      { content: "It's 32°C and sunny in Tel Aviv." },
    ]);
    const messages: ChatCompletionMessageParam[] = [
      { role: "user", content: "Weather in Tel Aviv?" },
    ];
    const handler: ToolHandler = vi.fn().mockResolvedValue("32°C, sunny, humidity 60%");

    const result = await chatWithTools(llm as any, messages, sampleTools, handler, "gpt-4", 5);

    expect(handler).toHaveBeenCalledWith("get_weather", { city: "Tel Aviv" });
    expect(result).toBe("It's 32°C and sunny in Tel Aviv.");
    expect(llm._create).toHaveBeenCalledTimes(2);
  });

  it("handles multiple tool calls in a single turn", async () => {
    const llm = createMockLLM([
      {
        tool_calls: [
          { id: "call_1", type: "function", function: { name: "get_weather", arguments: '{"city":"TLV"}' } },
          { id: "call_2", type: "function", function: { name: "get_weather", arguments: '{"city":"NYC"}' } },
        ],
      },
      { content: "TLV: 32°C, NYC: 20°C" },
    ]);
    const handler: ToolHandler = vi.fn()
      .mockResolvedValueOnce("32°C sunny")
      .mockResolvedValueOnce("20°C cloudy");

    const result = await chatWithTools(
      llm as any,
      [{ role: "user", content: "Compare weather" }],
      sampleTools,
      handler,
      "gpt-4",
      5,
    );

    expect(handler).toHaveBeenCalledTimes(2);
    expect(result).toBe("TLV: 32°C, NYC: 20°C");
  });

  it("respects maxTurns and throws when no text response is available", async () => {
    // LLM keeps calling tools on every turn
    const responses = Array.from({ length: 3 }, (_, i) => ({
      tool_calls: [{
        id: `call_${i}`,
        type: "function" as const,
        function: { name: "get_weather", arguments: '{"city":"loop"}' },
      }],
    }));

    const llm = createMockLLM(responses);
    const handler: ToolHandler = vi.fn().mockResolvedValue("still looping");

    // On the last turn, tools are stripped — but our mock still returns tool_calls
    // which means no text content is ever produced → should throw
    await expect(
      chatWithTools(llm as any, [{ role: "user", content: "loop" }], sampleTools, handler, "gpt-4", 3),
    ).rejects.toThrow("exceeded maximum tool-calling turns");
  });

  it("truncates large tool results when context overflows", async () => {
    const llm = createMockLLM([
      {
        tool_calls: [{
          id: "call_big",
          type: "function",
          function: { name: "get_weather", arguments: '{"city":"huge"}' },
        }],
      },
      { content: "Got it, that was a lot of data." },
    ]);

    // Return a massive result that should trigger the overflow guard
    const hugeResult = "x".repeat(900_000);
    const handler: ToolHandler = vi.fn().mockResolvedValue(hugeResult);

    const messages: ChatCompletionMessageParam[] = [
      { role: "user", content: "Get me everything" },
    ];

    const result = await chatWithTools(llm as any, messages, sampleTools, handler, "gpt-4", 5);

    expect(result).toBe("Got it, that was a lot of data.");
    // The second call should have truncated context
    const secondCall = llm._create.mock.calls[1];
    const msgs = secondCall[0].messages;
    const toolMsg = msgs.find((m: any) => m.role === "tool");
    // Should be truncated to ~2000 chars + truncation notice
    expect(toolMsg.content.length).toBeLessThan(3000);
    expect(toolMsg.content).toContain("[context limit");
  });

  it("handles malformed tool call arguments gracefully", async () => {
    const llm = createMockLLM([
      {
        tool_calls: [{
          id: "call_bad",
          type: "function",
          function: { name: "get_weather", arguments: "not valid json{{{" },
        }],
      },
      { content: "Handled the error." },
    ]);
    const handler: ToolHandler = vi.fn().mockResolvedValue("ok");

    const result = await chatWithTools(
      llm as any,
      [{ role: "user", content: "test" }],
      sampleTools,
      handler,
      "gpt-4",
      5,
    );

    // Should call handler with empty args (fallback)
    expect(handler).toHaveBeenCalledWith("get_weather", {});
    expect(result).toBe("Handled the error.");
  });
});
