import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions.mjs";

export function createInferenceClient(
  inferenceUrl: string,
  token: string,
): OpenAI {
  return new OpenAI({ baseURL: inferenceUrl, apiKey: token });
}

export type ToolHandler = (
  name: string,
  args: Record<string, unknown>,
) => Promise<string>;

/**
 * Multi-turn chat loop that processes tool calls until the LLM returns
 * a final text response (no more tool_calls).
 */
export async function chatWithTools(
  client: OpenAI,
  messages: ChatCompletionMessageParam[],
  tools: ChatCompletionTool[],
  handleToolCall: ToolHandler,
  model = "gpt-4o",
  maxTurns = 25,
): Promise<string> {
  const conversation = [...messages];

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await client.chat.completions.create({
      model,
      messages: conversation,
      tools: tools.length > 0 ? tools : undefined,
    });

    const choice = response.choices[0];
    if (!choice) throw new Error("No response from model");

    const msg = choice.message;
    conversation.push(msg);

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return msg.content ?? "";
    }

    for (const tc of msg.tool_calls) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {
        args = {};
      }

      const result = await handleToolCall(tc.function.name, args);
      conversation.push({
        role: "tool",
        tool_call_id: tc.id,
        content: result,
      });
    }
  }

  throw new Error("chatWithTools: exceeded maximum tool-calling turns");
}

/**
 * Chat requesting structured JSON output conforming to a JSON schema.
 */
export async function chatWithSchema<T>(
  client: OpenAI,
  messages: ChatCompletionMessageParam[],
  schemaName: string,
  schema: Record<string, unknown>,
  model = "gpt-4o",
): Promise<T> {
  const response = await client.chat.completions.create({
    model,
    messages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: schemaName,
        strict: true,
        schema,
      },
    },
  });

  const content = response.choices[0]?.message.content;
  if (!content) throw new Error("No content in structured response");
  return JSON.parse(content) as T;
}
