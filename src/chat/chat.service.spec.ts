import { EntityManager } from '@mikro-orm/core';
import { HttpClientService } from '../httpclient/httpclient.service';
import { ChatMessage } from './api/ChatMessage';
import { ChatService } from './chat.service';

describe('ChatService', () => {
  const OLD_ENV = process.env;

  let executeMock: jest.Mock;
  let postMock: jest.Mock;
  let getConnectionMock: jest.Mock;
  let em: EntityManager;
  let httpClient: HttpClientService;
  let service: ChatService;

  const build = () => {
    executeMock = jest.fn().mockResolvedValue([]);
    postMock = jest.fn();
    getConnectionMock = jest.fn(() => ({ execute: executeMock }));
    em = { getConnection: getConnectionMock } as unknown as EntityManager;
    httpClient = { post: postMock } as unknown as HttpClientService;
    return new ChatService(httpClient, em);
  };

  const userMsg = (content: string): ChatMessage[] => [
    { role: 'user', content }
  ];

  const llmReply = (content: string) => ({
    choices: [{ message: { role: 'assistant', content } }]
  });

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    process.env.CHAT_MOCK_ENABLED = 'true';
    // Disable the simulated latency so tests do not wait.
    process.env.CHAT_MOCK_DELAY_MIN_MS = '0';
    process.env.CHAT_MOCK_DELAY_MAX_MS = '0';
    // Configure the fallback LLM.
    process.env.CHAT_API_URL = 'http://llm.test/v1/chat/completions';
    process.env.CHAT_API_MODEL = 'smollm:135m';
    process.env.CHAT_API_TOKEN = '';
    service = build();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('returns a mock DB response when a keyword matches (no LLM call)', async () => {
    executeMock.mockResolvedValueOnce([{ response: 'MOCKED RESPONSE' }]);

    const result = await service.query(userMsg('what tools do you have'));

    expect(result).toBe('MOCKED RESPONSE');
    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(postMock).not.toHaveBeenCalled();
  });

  it('searches only the latest user prompt', async () => {
    executeMock.mockResolvedValueOnce([{ response: 'MOCKED RESPONSE' }]);

    await service.query([
      { role: 'user', content: 'first question about napalm' },
      { role: 'assistant', content: 'some earlier answer with gasoline' },
      { role: 'user', content: 'latest prompt' }
    ]);

    expect(executeMock.mock.calls[0][1]).toEqual(['latest prompt']);
  });

  it('does not crash when message content is not a string (type confusion)', async () => {
    postMock.mockResolvedValueOnce(llmReply('LLM ANSWER'));
    const messages = [
      { role: 'user', content: ['array', 'not', 'a', 'string'] }
    ] as unknown as ChatMessage[];

    const result = await service.query(messages);

    expect(result).toBe('LLM ANSWER');
    expect(executeMock).not.toHaveBeenCalled(); // empty prompt -> no DB lookup
  });

  it('does not crash when messages is not an array (parameter tampering)', async () => {
    postMock.mockResolvedValueOnce(llmReply('LLM ANSWER'));

    const result = await service.query('napalm' as unknown as ChatMessage[]);

    expect(result).toBe('LLM ANSWER');
    expect(executeMock).not.toHaveBeenCalled(); // empty prompt -> no DB lookup
  });

  it('falls back to the LLM when no mock matches', async () => {
    executeMock.mockResolvedValueOnce([]); // no keyword match
    postMock.mockResolvedValueOnce(llmReply('LLM ANSWER'));

    const result = await service.query(userMsg('totally unrelated question'));

    expect(result).toBe('LLM ANSWER');
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it('skips the DB and calls the LLM directly when mock mode is disabled', async () => {
    process.env.CHAT_MOCK_ENABLED = 'false';
    service = build();
    postMock.mockResolvedValueOnce(llmReply('LLM ANSWER'));

    const result = await service.query(userMsg('what tools do you have'));

    expect(result).toBe('LLM ANSWER');
    expect(getConnectionMock).not.toHaveBeenCalled();
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it('does not sleep when the delay is disabled via env (0/0)', async () => {
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    executeMock.mockResolvedValueOnce([{ response: 'MOCKED RESPONSE' }]);

    await service.query(userMsg('what tools do you have'));

    expect(setTimeoutSpy).not.toHaveBeenCalled();
    setTimeoutSpy.mockRestore();
  });

  it('returns a safe default (not an error) when the LLM call fails', async () => {
    executeMock.mockResolvedValueOnce([]); // no keyword match
    postMock.mockRejectedValueOnce(new Error('LLM unreachable'));

    const result = await service.query(userMsg('unrelated'));

    expect(result).toContain('AI assistant');
  });

  it('creates and reseeds the mock table on init when enabled', async () => {
    await service.onModuleInit();

    const sqls = executeMock.mock.calls.map((call) => String(call[0]));
    expect(sqls.some((s) => /create table if not exists/i.test(s))).toBe(true);
    expect(sqls.some((s) => /delete from chat_mock_response/i.test(s))).toBe(
      true
    );
    expect(sqls.some((s) => /insert into chat_mock_response/i.test(s))).toBe(
      true
    );
  });

  it('does not touch the DB on init when mock mode is disabled', async () => {
    process.env.CHAT_MOCK_ENABLED = 'false';
    service = build();

    await service.onModuleInit();

    expect(getConnectionMock).not.toHaveBeenCalled();
  });
});
