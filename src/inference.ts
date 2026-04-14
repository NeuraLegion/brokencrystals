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

/** Strip control characters and null bytes that break JSON serialization */
function sanitizeForJson(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

export type ToolHandler = (
  name: string,  args: Record<string, unknown>,
) => Promise<string>;

// ---------------------------------------------------------------------------
// Model selection: static vs escalating
// ---------------------------------------------------------------------------

export type ModelStrategy = "static" | "escalating";

export class ModelSelector {
  private readonly tiers: string[];
  private readonly strategy: ModelStrategy;
  private level = 0;

  constructor(strategy: ModelStrategy, tiers: string[]) {
    if (tiers.length === 0) throw new Error("At least one model tier is required");
    this.strategy = strategy;
    this.tiers = tiers;
  }

  /** The model name to use for the next LLM call. */
  current(): string {
    return this.tiers[this.level];
  }

  /**
   * Move to the next stronger model tier.
   * Returns true if escalation happened, false if already at the strongest tier.
   * In static mode this is a no-op.
   */
  escalate(): boolean {
    if (this.strategy === "static") return false;
    if (this.level >= this.tiers.length - 1) return false;
    this.level++;
    console.log(`[Model] Escalated to ${this.tiers[this.level]} (tier ${this.level + 1}/${this.tiers.length})`);
    return true;
  }

  /** Reset back to the base (cheapest) model. No-op in static mode. */
  reset(): void {
    if (this.strategy === "static") return;
    if (this.level !== 0) {
      this.level = 0;
      console.log(`[Model] Reset to base model: ${this.tiers[0]}`);
    }
  }

  /** Whether we are above the base tier. */
  isEscalated(): boolean {
    return this.level > 0;
  }

  toString(): string {
    return `${this.strategy}[${this.tiers.join(" → ")}] @ tier ${this.level + 1}`;
  }
}

/**
 * Validate that all configured model tiers are available from the inference
 * provider. Throws with a clear message listing invalid and available models.
 */
export async function validateModelTiers(
  client: OpenAI,
  selector: ModelSelector,
): Promise<void> {
  const tiers = selector["tiers"]; // access private field for validation
  let available: string[];
  try {
    const list = await client.models.list();
    available = [];
    for await (const model of list) {
      available.push(model.id);
    }
  } catch (err) {
    console.warn(`[Model] Could not list available models — skipping tier validation: ${err}`);
    return;
  }

  const availableSet = new Set(available);
  const invalid = tiers.filter((t: string) => !availableSet.has(t));

  if (invalid.length > 0) {
    const availableSorted = available.sort().join("\n  - ");
    throw new Error(
      `Invalid model tier(s): ${invalid.join(", ")}\n` +
      `Available models:\n  - ${availableSorted}`,
    );
  }

  console.log(`[Model] All ${tiers.length} model tier(s) validated successfully`);
}

/**
 * Multi-turn chat loop that processes tool calls until the LLM returns
 * a final text response (no more tool_calls).
 */
export const DEFAULT_MODEL = "gpt-5.4-mini";

export async function chatWithTools(
  client: OpenAI,
  messages: ChatCompletionMessageParam[],
  tools: ChatCompletionTool[],
  handleToolCall: ToolHandler,
  model = DEFAULT_MODEL,
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
        content: sanitizeForJson(result),
      });
    }
  }

  // Exhausted turns — return the last assistant content if available
  console.warn(`[Inference] chatWithTools: exhausted ${maxTurns} tool-calling turns, returning last response`);
  for (let i = conversation.length - 1; i >= 0; i--) {
    const m = conversation[i];
    if (m.role === "assistant" && "content" in m && m.content) {
      return typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    }
  }
  throw new Error("chatWithTools: exceeded maximum tool-calling turns with no assistant response");
}

/**
 * Chat requesting structured JSON output conforming to a JSON schema.
 */
export async function chatWithSchema<T>(
  client: OpenAI,
  messages: ChatCompletionMessageParam[],
  schemaName: string,
  schema: Record<string, unknown>,
  model = DEFAULT_MODEL,
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
