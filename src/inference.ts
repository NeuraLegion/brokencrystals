import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionTool,
} from "openai/resources/chat/completions.mjs";
import type { ReasoningEffort } from "openai/resources/shared.mjs";

// ---------------------------------------------------------------------------
// Inference provider detection
// ---------------------------------------------------------------------------

export type InferenceProvider = "openai" | "github-models" | "ollama";

/**
 * Detect the inference provider from the base URL.
 * Can be overridden via INFERENCE_PROVIDER env var.
 */
export function detectProvider(baseUrl: string): InferenceProvider {
  const explicit = process.env.INFERENCE_PROVIDER?.toLowerCase();
  if (
    explicit === "github-models" ||
    explicit === "ollama" ||
    explicit === "openai"
  ) {
    return explicit;
  }

  const url = baseUrl.toLowerCase();
  if (
    url.includes("models.github.ai") ||
    url.includes("models.inference.ai.azure.com")
  ) {
    return "github-models";
  }
  if (
    url.includes("localhost:11434") ||
    url.includes("127.0.0.1:11434") ||
    url.includes("/ollama")
  ) {
    return "ollama";
  }
  return "openai";
}

/**
 * Normalize the base URL for each provider so the OpenAI SDK sends requests
 * to the correct path.
 */
function normalizeBaseUrl(
  baseUrl: string,
  provider: InferenceProvider,
): string {
  if (provider === "ollama") {
    // Ollama exposes OpenAI-compat at /v1 — ensure the suffix is present
    const trimmed = baseUrl.replace(/\/+$/, "");
    return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
  }
  return baseUrl;
}

export function createInferenceClient(
  inferenceUrl: string,
  token: string,
  provider?: InferenceProvider,
): OpenAI {
  const resolved = provider ?? detectProvider(inferenceUrl);
  const baseURL = normalizeBaseUrl(inferenceUrl, resolved);

  const opts: ConstructorParameters<typeof OpenAI>[0] = {
    baseURL,
    apiKey: token || "ollama", // Ollama doesn't require a key
  };

  if (resolved === "github-models") {
    opts.defaultHeaders = {
      "X-GitHub-Api-Version": "2026-03-10",
    };
  }

  console.log(`[Inference] Provider: ${resolved}, baseURL: ${baseURL}`);
  return new OpenAI(opts);
}

/** Strip control characters and null bytes that break JSON serialization */
function sanitizeForJson(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

export type ToolHandler = (
  name: string,
  args: Record<string, unknown>,
) => Promise<string>;

const loggedReasoningModels = new Set<string>();
const loggedReasoningSkippedForTools = new Set<string>();

function isReasoningModel(model: string): boolean {
  const normalized = model.toLowerCase();
  return /(?:^|[-_.])o[1-9](?:$|[-_.])/.test(normalized) ||
    normalized.startsWith("o1") ||
    normalized.startsWith("o3") ||
    normalized.startsWith("o4") ||
    normalized.startsWith("gpt-5") ||
    normalized.includes("codex") ||
    normalized.startsWith("gpt-oss");
}

function configuredReasoningEffort(model: string): ReasoningEffort | undefined {
  if (!isReasoningModel(model)) return undefined;

  const raw = (process.env.AI_REASONING_EFFORT ?? "medium").trim().toLowerCase();
  if (raw === "" || raw === "none" || raw === "off" || raw === "false" || raw === "0") {
    return undefined;
  }
  if (raw === "low" || raw === "medium" || raw === "high") {
    return raw;
  }
  throw new Error(`Invalid AI_REASONING_EFFORT "${process.env.AI_REASONING_EFFORT}". Expected low, medium, high, or none.`);
}

function chatCompletionParams(
  model: string,
  messages: ChatCompletionMessageParam[],
  extra: Omit<ChatCompletionCreateParamsNonStreaming, "model" | "messages" | "max_completion_tokens"> = {},
  options: { allowReasoningEffort?: boolean } = {},
): ChatCompletionCreateParamsNonStreaming {
  const params: ChatCompletionCreateParamsNonStreaming = {
    model,
    messages,
    max_completion_tokens: 16384,
    ...extra,
  };
  const reasoningEffort = configuredReasoningEffort(model);
  const allowReasoningEffort = options.allowReasoningEffort ?? true;
  if (reasoningEffort && allowReasoningEffort) {
    params.reasoning_effort = reasoningEffort;
    const key = `${model}:${reasoningEffort}`;
    if (!loggedReasoningModels.has(key)) {
      loggedReasoningModels.add(key);
      console.log(`[Inference] Reasoning model enabled: ${model} (effort=${reasoningEffort})`);
    }
  } else if (reasoningEffort && !allowReasoningEffort && !loggedReasoningSkippedForTools.has(model)) {
    loggedReasoningSkippedForTools.add(model);
    console.log(`[Inference] Reasoning effort skipped for ${model} during function-tool calls`);
  }
  return params;
}

// ---------------------------------------------------------------------------
// Model selection — always escalates through the configured tier list.
// Single-model configs simply stay on that model.
// ---------------------------------------------------------------------------

export class ModelSelector {
  private readonly tiers: string[];
  private level = 0;

  constructor(tiers: string[]) {
    if (tiers.length === 0)
      throw new Error("At least one model is required in AI_MODEL");
    this.tiers = tiers;
  }

  /** The model name to use for the next LLM call. */
  current(): string {
    return this.tiers[this.level];
  }

  /**
   * Move to the next stronger model tier.
   * Returns true if escalation happened, false if already at the strongest tier.
   */
  escalate(): boolean {
    if (this.level >= this.tiers.length - 1) return false;
    this.level++;
    console.log(
      `[Model] Escalated to ${this.tiers[this.level]} (tier ${this.level + 1}/${this.tiers.length})`,
    );
    return true;
  }

  /** Reset back to the base (cheapest) model. */
  reset(): void {
    if (this.level !== 0) {
      this.level = 0;
      console.log(`[Model] Reset to base model: ${this.tiers[0]}`);
    }
  }

  /** Whether we are above the base tier. */
  isEscalated(): boolean {
    return this.level > 0;
  }

  /**
   * Return the model name of the next stronger tier WITHOUT changing the
   * current level. Returns the current tier name if already at the top.
   * Useful for spawning a parallel "critic" call on a stronger model
   * without disturbing the worker's current tier.
   */
  peekEscalated(): string {
    const next = Math.min(this.level + 1, this.tiers.length - 1);
    return this.tiers[next];
  }

  toString(): string {
    if (this.tiers.length === 1) return this.tiers[0];
    return `[${this.tiers.join(" → ")}] @ tier ${this.level + 1}`;
  }
}

/**
 * Validate that all configured model tiers are available from the inference
 * provider. Throws with a clear message listing invalid and available models.
 */
export async function validateModelTiers(
  client: OpenAI,
  selector: ModelSelector,
  provider: InferenceProvider = "openai",
): Promise<void> {
  const tiers = selector["tiers"]; // access private field for validation

  // GitHub Models doesn't expose a standard /v1/models list endpoint;
  // skip tier validation and rely on runtime errors for bad model names.
  if (provider === "github-models") {
    console.log(
      `[Model] GitHub Models provider — skipping tier validation (${tiers.length} tier(s) configured)`,
    );
    return;
  }

  let available: string[];
  try {
    const list = await client.models.list();
    available = [];
    for await (const model of list) {
      available.push(model.id);
    }
  } catch (err) {
    console.warn(
      `[Model] Could not list available models — skipping tier validation: ${err}`,
    );
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

  console.log(
    `[Model] All ${tiers.length} model tier(s) validated successfully`,
  );
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
  const allowReasoningEffort = tools.length === 0;

  for (let turn = 0; turn < maxTurns; turn++) {
    // On the last turn, strip tools to force a text response
    const isLastTurn = turn === maxTurns - 1;
    const response = await client.chat.completions.create(chatCompletionParams(model, conversation, {
      tools: !isLastTurn && tools.length > 0 ? tools : undefined,
    }, { allowReasoningEffort }));

    const choice = response.choices[0];
    if (!choice) throw new Error("No response from model");

    const msg = choice.message;
    const usage = response.usage;
    conversation.push(msg);

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      if (usage) {
        console.log(
          `[Inference] Turn ${turn + 1}/${maxTurns}: final response (${usage.prompt_tokens}→${usage.completion_tokens} tokens)`,
        );
      }
      return msg.content ?? "";
    }

    const toolNames = msg.tool_calls.map((tc) => tc.function.name).join(", ");
    if (usage) {
      console.log(
        `[Inference] Turn ${turn + 1}/${maxTurns}: ${msg.tool_calls.length} tool call(s) [${toolNames}] (${usage.prompt_tokens}→${usage.completion_tokens} tokens)`,
      );
    } else {
      console.log(
        `[Inference] Turn ${turn + 1}/${maxTurns}: ${msg.tool_calls.length} tool call(s) [${toolNames}]`,
      );
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
  console.warn(
    `[Inference] chatWithTools: exhausted ${maxTurns} tool-calling turns, returning last response`,
  );
  for (let i = conversation.length - 1; i >= 0; i--) {
    const m = conversation[i];
    if (m.role === "assistant" && "content" in m && m.content) {
      return typeof m.content === "string"
        ? m.content
        : JSON.stringify(m.content);
    }
  }
  throw new Error(
    "chatWithTools: exceeded maximum tool-calling turns with no assistant response",
  );
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
  const response = await client.chat.completions.create(chatCompletionParams(model, messages, {
    response_format: {
      type: "json_schema",
      json_schema: {
        name: schemaName,
        strict: true,
        schema,
      },
    },
  }));

  const choice = response.choices[0];
  const content = choice?.message.content;
  if (!content) throw new Error("No content in structured response");
  if (choice.finish_reason === "length") {
    throw new Error(`Structured response truncated (${content.length} chars) — output exceeded max_completion_tokens`);
  }
  return JSON.parse(content) as T;
}
