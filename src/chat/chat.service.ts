import { EntityManager } from '@mikro-orm/core';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpClientService } from '../httpclient/httpclient.service';
import { ChatMessage } from './api/ChatMessage';
import { CHAT_MOCK_SEED } from './chat-mock.seed';

const DEFAULT_CHAT_API_MAX_TOKENS = 200;

// Simulated LLM latency (ms) for the mock path; overridable via env.
const DEFAULT_MOCK_DELAY_MIN_MS = 400;
const DEFAULT_MOCK_DELAY_MAX_MS = 1500;

interface ChatRequest {
  readonly model: string;
  readonly messages: ChatMessage[];
  readonly stream: boolean;
  readonly max_tokens?: number;
  readonly temperature?: number;
}

interface ChatResponse {
  readonly choices: {
    readonly message: ChatMessage;
  }[];
}

@Injectable()
export class ChatService implements OnModuleInit {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly httpClient: HttpClientService,
    private readonly em: EntityManager
  ) {}

  async onModuleInit(): Promise<void> {
    // Only create/reseed the mock table when mock mode is enabled, so the
    // service does not write to the DB when it is not needed.
    if (this.isMockEnabled()) {
      await this.ensureMockData();
    }
  }

  // Mock mode is on by default; set CHAT_MOCK_ENABLED=false for a pure LLM passthrough.
  private isMockEnabled(): boolean {
    return (process.env.CHAT_MOCK_ENABLED ?? 'true').toLowerCase() !== 'false';
  }

  async query(messages: ChatMessage[]): Promise<string> {
    this.logger.debug(`Chat query: ${JSON.stringify(messages)}`);

    // Search only the latest user prompt; earlier turns/answers pollute the match.
    const prompt = this.lastUserPrompt(messages);

    if (this.isMockEnabled()) {
      const canned = await this.findMockResponse(prompt);
      if (canned) {
        await this.simulateThinkingDelay();
        this.logger.debug('Answered chat query from mock DB');
        return canned;
      }
    }

    this.logger.debug('No mock match, falling back to LLM');
    return this.completion(messages);
  }

  private lastUserPrompt(messages: ChatMessage[]): string {
    if (!Array.isArray(messages) || messages.length === 0) {
      return '';
    }
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (
        message !== null &&
        typeof message === 'object' &&
        (message as ChatMessage).role === 'user' &&
        typeof (message as ChatMessage).content === 'string'
      ) {
        return (message as ChatMessage).content;
      }
    }

    const last = messages[messages.length - 1];
    const lastContent =
      last !== null && typeof last === 'object'
        ? (last as ChatMessage).content
        : undefined;
    return typeof lastContent === 'string' ? lastContent : '';
  }

  // Parses an integer env var, using the fallback only when unset, empty, or
  // non-numeric. A present value of "0" is honored (not replaced).
  private envInt(value: string | undefined, fallback: number): number {
    if (value === undefined || value.trim() === '') {
      return fallback;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  // Random delay in the configured range to mimic LLM latency (set 0/0 to disable).
  private async simulateThinkingDelay(): Promise<void> {
    const min = this.envInt(
      process.env.CHAT_MOCK_DELAY_MIN_MS,
      DEFAULT_MOCK_DELAY_MIN_MS
    );
    const max = this.envInt(
      process.env.CHAT_MOCK_DELAY_MAX_MS,
      DEFAULT_MOCK_DELAY_MAX_MS
    );
    const low = Math.max(0, Math.min(min, max));
    const high = Math.max(low, max);
    if (high <= 0) {
      return;
    }
    const ms = low + Math.floor(Math.random() * (high - low + 1));
    this.logger.debug(`Simulating LLM latency: ${ms}ms`);
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async findMockResponse(prompt: string): Promise<string | undefined> {
    if (!prompt.trim().length) {
      return undefined;
    }

    try {
      // Choose the best-fitting row: the longest matching keyword is the most
      // specific match for the prompt. random() only breaks ties between
      // keywords of equal length.
      const rows: Array<{ response: string }> = await this.em
        .getConnection()
        .execute(
          `select response from chat_mock_response where ? ILIKE '%' || keyword || '%' order by length(keyword) desc, random() limit 1`,
          [prompt]
        );

      return rows?.[0]?.response;
    } catch (error) {
      this.logger.warn(`Mock response lookup failed: ${error}`);
      return undefined;
    }
  }

  // Safe default when the fallback model is unavailable/empty; carries an LLM
  // indicator and avoids surfacing errors to the caller.
  private static readonly DEFAULT_FALLBACK_RESPONSE =
    'I am an AI assistant for this crystal store. Could you rephrase your question so I can help?';

  // Fallback path: query the small local model; any failure degrades to the
  // safe default instead of throwing.
  private async completion(messages: ChatMessage[]): Promise<string> {
    if (
      !process.env.CHAT_API_URL ||
      !process.env.CHAT_API_MODEL ||
      process.env.CHAT_API_TOKEN === undefined // Allow empty string since we use ollama by default
    ) {
      this.logger.warn(
        'Chat API env vars missing (CHAT_API_URL/CHAT_API_MODEL/CHAT_API_TOKEN); using default response'
      );
      return ChatService.DEFAULT_FALLBACK_RESPONSE;
    }

    const chatRequest: ChatRequest = {
      model: process.env.CHAT_API_MODEL,
      messages,
      max_tokens:
        +process.env.CHAT_API_MAX_TOKENS || DEFAULT_CHAT_API_MAX_TOKENS,
      stream: false,
      temperature: 0.7
    };

    try {
      const res = await this.httpClient.post<ChatResponse>(
        process.env.CHAT_API_URL,
        chatRequest,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.CHAT_API_TOKEN}`
          },
          timeout: 300000 // 5 minutes timeout for ollama service
        }
      );

      const answer = res?.choices?.[0]?.message?.content;
      return answer && answer.trim().length
        ? answer
        : ChatService.DEFAULT_FALLBACK_RESPONSE;
    } catch (error) {
      this.logger.warn(`Fallback LLM call failed: ${error}`);
      return ChatService.DEFAULT_FALLBACK_RESPONSE;
    }
  }

  // Creates the mock table if missing and reseeds it from CHAT_MOCK_SEED.
  private async ensureMockData(): Promise<void> {
    try {
      const connection = this.em.getConnection();

      await connection.execute(
        `create table if not exists "chat_mock_response" (
           "id" serial primary key,
           "created_at" timestamptz(0) not null default now(),
           "updated_at" timestamptz(0) not null default now(),
           "keyword" varchar(255) not null,
           "response" text not null
         )`
      );

      // Reseed on every boot so the DB always matches CHAT_MOCK_SEED.
      await connection.execute(`delete from chat_mock_response`);

      for (const row of CHAT_MOCK_SEED) {
        await connection.execute(
          `insert into chat_mock_response (created_at, updated_at, keyword, response)
           values (now(), now(), ?, ?)`,
          [row.keyword, row.response]
        );
      }

      this.logger.log(
        `Seeded chat_mock_response with ${CHAT_MOCK_SEED.length} rows (reseeded)`
      );
    } catch (error) {
      this.logger.warn(`Failed to ensure chat mock data: ${error}`);
    }
  }
}
