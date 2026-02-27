import { SecRunner } from '@sectester/runner';
import axios, { AxiosResponse } from 'axios';

const secTesterTarget =
  process.env.SEC_TESTER_TARGET?.trim() || 'http://127.0.0.1:3000';
const mcpUrl = `${secTesterTarget}/api/mcp`;
const authUrl = `${secTesterTarget}/api/auth/admin/login`;
const hasSecTesterCreds =
  !!process.env.BRIGHT_TOKEN && !!process.env.BRIGHT_CLUSTER;

type McpRole = 'guest' | 'user' | 'admin';

interface InitializedMcpSession {
  sessionId: string;
  authenticated: boolean;
  role: McpRole;
  user?: string;
}

interface McpJsonRpcEnvelope {
  jsonrpc: string;
  id?: string | number;
  result?: {
    content?: Array<{
      type: string;
      text: string;
    }>;
  };
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface ParsedSseEvent {
  event: string;
  data: unknown;
}

interface ParsedStreamedToolResponse {
  notifications: Array<Record<string, unknown>>;
  finalRpc: McpJsonRpcEnvelope;
}

const withBearer = (token: string): string =>
  token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`;

const parseSseMessage = (payload: string): McpJsonRpcEnvelope => {
  const normalized = payload.replace(/\r\n/g, '\n');
  const eventLine = normalized
    .split('\n')
    .find((line) => line.startsWith('event:'));
  const dataLine = normalized
    .split('\n')
    .find((line) => line.startsWith('data:'));

  if (eventLine?.trim() !== 'event: message') {
    throw new Error(`Invalid SSE event line: ${eventLine}`);
  }
  if (!dataLine) {
    throw new Error('Missing SSE data line');
  }

  return JSON.parse(
    dataLine.slice('data:'.length).trim()
  ) as McpJsonRpcEnvelope;
};

const parseSseEvents = (payload: string): ParsedSseEvent[] =>
  payload
    .replace(/\r\n/g, '\n')
    .split('\n\n')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => {
      const eventLine = chunk
        .split('\n')
        .find((line) => line.startsWith('event:'));
      const dataLine = chunk
        .split('\n')
        .find((line) => line.startsWith('data:'));

      if (!eventLine || !dataLine) {
        throw new Error(`Invalid SSE payload chunk: ${chunk}`);
      }

      return {
        event: eventLine.slice('event:'.length).trim(),
        data: JSON.parse(dataLine.slice('data:'.length).trim())
      };
    });

const parseStreamedToolResponse = (
  payload: string
): ParsedStreamedToolResponse => {
  const events = parseSseEvents(payload);
  const notifications = events
    .filter((event) => event.event === 'notification')
    .map((event) => event.data as Record<string, unknown>);

  const messageEvent = [...events]
    .reverse()
    .find((event) => event.event === 'message');

  if (!messageEvent) {
    throw new Error('Missing final message event in SSE payload');
  }

  return {
    notifications,
    finalRpc: messageEvent.data as McpJsonRpcEnvelope
  };
};

const postMcp = async (
  payload: Record<string, unknown>,
  headers: Record<string, string> = {}
): Promise<AxiosResponse> =>
  axios.post(mcpUrl, payload, {
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    validateStatus: () => true
  });

const loginForMcp = async (
  user: string = 'admin',
  password: string = 'admin'
): Promise<string> => {
  const { headers } = await axios.post(authUrl, {
    user,
    password,
    op: 'basic'
  });

  const token = headers.authorization;
  if (!token || typeof token !== 'string') {
    throw new Error('MCP test setup failed: missing authorization header');
  }

  return token;
};

const initializeMcpSession = async (
  authorization?: string
): Promise<InitializedMcpSession> => {
  const headers: Record<string, string> = {};
  if (authorization) {
    headers.authorization = withBearer(authorization);
  }

  const response = await postMcp(
    {
      jsonrpc: '2.0',
      method: 'initialize',
      id: 0
    },
    headers
  );

  if (response.status !== 200) {
    throw new Error(
      `MCP test setup failed: initialize returned status ${response.status}`
    );
  }

  const session = response.data?.result?.session;
  const headerSessionId = response.headers['mcp-session-id'];
  const sessionIdFromHeader = Array.isArray(headerSessionId)
    ? headerSessionId[0]
    : headerSessionId;
  const sessionId = sessionIdFromHeader || session?.sessionId;

  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error(
      'MCP test setup failed: initialize did not return Mcp-Session-Id'
    );
  }

  return {
    sessionId,
    authenticated: !!session?.authenticated,
    role:
      session?.role === 'admin' || session?.role === 'user'
        ? session.role
        : 'guest',
    user:
      typeof session?.user === 'string' && session.user.length
        ? session.user
        : undefined
  };
};

describe('/api', () => {
  const timeout = 600000;
  jest.setTimeout(timeout);

  describe('POST /mcp', () => {
    describe('initialize', () => {
      it('should initialize MCP session without authentication', async () => {
        const mcpSession = await initializeMcpSession();

        expect(mcpSession.sessionId).toBeTruthy();
        expect(mcpSession.authenticated).toBe(false);
        expect(mcpSession.role).toBe('guest');
      });

      it('should initialize MCP session with admin authentication', async () => {
        const token = await loginForMcp('admin', 'admin');
        const mcpSession = await initializeMcpSession(token);

        expect(mcpSession.sessionId).toBeTruthy();
        expect(mcpSession.authenticated).toBe(true);
        expect(mcpSession.role).toBe('admin');
      });

      it('should initialize MCP session with regular user authentication', async () => {
        const token = await loginForMcp('user', 'user');
        const mcpSession = await initializeMcpSession(token);

        expect(mcpSession.sessionId).toBeTruthy();
        expect(mcpSession.authenticated).toBe(true);
        expect(mcpSession.role).toBe('user');
      });
    });

    describe('initialize + tools/list', () => {
      it('should require initialize before tools/list and allow access after session setup', async () => {
        const withoutSession = await postMcp({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1
        });

        expect(withoutSession.status).toBe(400);
        expect(withoutSession.data?.error?.code).toBe(-32002);

        const mcpSession = await initializeMcpSession();

        const withSession = await postMcp(
          {
            jsonrpc: '2.0',
            method: 'tools/list',
            id: 2
          },
          {
            'Mcp-Session-Id': mcpSession.sessionId
          }
        );

        expect(withSession.status).toBe(200);
        expect(Array.isArray(withSession.data?.result?.tools)).toBe(true);
      });
    });

    describe('initialize + resources/list', () => {
      it('should require initialize before resources/list and allow access after session setup', async () => {
        const withoutSession = await postMcp({
          jsonrpc: '2.0',
          method: 'resources/list',
          id: 2
        });

        expect(withoutSession.status).toBe(400);
        expect(withoutSession.data?.error?.code).toBe(-32002);

        const mcpSession = await initializeMcpSession();

        const withSession = await postMcp(
          {
            jsonrpc: '2.0',
            method: 'resources/list',
            id: 3
          },
          {
            'Mcp-Session-Id': mcpSession.sessionId
          }
        );

        expect(withSession.status).toBe(200);
        expect(Array.isArray(withSession.data?.result?.resources)).toBe(true);
      });
    });

    describe('role-based access', () => {
      it('should deny admin-only tool for guest MCP session', async () => {
        const mcpSession = await initializeMcpSession();
        const response = await postMcp(
          {
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'get_config',
              arguments: {}
            },
            id: 3
          },
          {
            'Mcp-Session-Id': mcpSession.sessionId
          }
        );

        expect(response.status).toBe(200);
        expect(response.data?.error?.code).toBe(-32001);
        expect(response.data?.error?.message).toContain(
          'requires authentication'
        );
      });

      it('should deny admin-only tool for regular authenticated MCP session', async () => {
        const token = await loginForMcp('user', 'user');
        const mcpSession = await initializeMcpSession(token);
        const response = await postMcp(
          {
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'get_config',
              arguments: {}
            },
            id: 4
          },
          {
            'Mcp-Session-Id': mcpSession.sessionId
          }
        );

        expect(response.status).toBe(200);
        expect(response.data?.error?.code).toBe(-32001);
        expect(response.data?.error?.message).toContain('requires admin role');
      });

      it('should allow admin-only tool for admin MCP session', async () => {
        const token = await loginForMcp('admin', 'admin');
        const mcpSession = await initializeMcpSession(token);
        const response = await postMcp(
          {
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'get_config',
              arguments: {}
            },
            id: 5
          },
          {
            'Mcp-Session-Id': mcpSession.sessionId
          }
        );

        expect(response.status).toBe(200);
        expect(response.data?.error).toBeUndefined();
        expect(Array.isArray(response.data?.result?.content)).toBe(true);
      });
    });

    describe('render (event-stream)', () => {
      it('should return event-stream payload for render', async () => {
        const mcpSession = await initializeMcpSession();
        const response = await postMcp(
          {
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'render',
              arguments: {
                numbers: [1, 2, 3],
                template: 'Result: {{=it.sum}}'
              }
            },
            id: 7
          },
          {
            'Mcp-Session-Id': mcpSession.sessionId
          }
        );

        expect(response.status).toBe(200);
        expect(String(response.headers['content-type'])).toContain(
          'text/event-stream'
        );
        expect(typeof response.data).toBe('string');

        const rpc = parseSseMessage(response.data as string);
        expect(rpc.error).toBeUndefined();
        expect(rpc.result?.content?.[0]?.text).toContain('Result: 6');
      });
    });

    describe('spawn_process (event-stream with notifications)', () => {
      it('should stream progress notifications and final JSON-RPC result for spawn_process', async () => {
        const token = await loginForMcp('admin', 'admin');
        const mcpSession = await initializeMcpSession(token);
        const response = await postMcp(
          {
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'spawn_process',
              arguments: {
                command: 'node -e console.log(process.version)'
              }
            },
            id: 10
          },
          {
            'Mcp-Session-Id': mcpSession.sessionId
          }
        );

        expect(response.status).toBe(200);
        expect(String(response.headers['content-type'])).toContain(
          'text/event-stream'
        );
        expect(typeof response.data).toBe('string');

        const { notifications, finalRpc } = parseStreamedToolResponse(
          response.data as string
        );

        expect(notifications.length).toBeGreaterThan(0);
        expect(notifications[0]?.jsonrpc).toBe('2.0');

        const progressNotifications = notifications.filter(
          (notification) => notification.method === 'notifications/progress'
        );
        expect(progressNotifications.length).toBeGreaterThan(0);

        const progressParams = progressNotifications[0]?.params as
          | Record<string, unknown>
          | undefined;
        expect(progressParams?.tool).toBe('spawn_process');
        expect(progressParams?.status).toBe('starting');

        const partialOutputNotifications = notifications.filter(
          (notification) =>
            notification.method === 'notifications/partial_output'
        );
        expect(partialOutputNotifications.length).toBeGreaterThan(0);

        const partialParams = partialOutputNotifications[0]?.params as
          | Record<string, unknown>
          | undefined;
        expect(partialParams?.tool).toBe('spawn_process');
        expect(['stdout', 'stderr']).toContain(partialParams?.stream);
        expect(typeof partialParams?.text).toBe('string');

        expect(finalRpc.error).toBeUndefined();
        expect(finalRpc.result?.content?.[0]?.text).toContain(
          'OS command result:'
        );
      });
    });

    describe('lfi resource', () => {
      it('should allow guest MCP session to read local files via resources/read', async () => {
        const mcpSession = await initializeMcpSession();
        const response = await postMcp(
          {
            jsonrpc: '2.0',
            method: 'resources/read',
            params: {
              uri: 'file:///etc/hosts'
            },
            id: 8
          },
          {
            'Mcp-Session-Id': mcpSession.sessionId
          }
        );

        expect(response.status).toBe(200);
        expect(response.data?.error).toBeUndefined();
        expect(response.data?.result?.contents?.[0]?.uri).toBe(
          'file:///etc/hosts'
        );
        expect(response.data?.result?.contents?.[0]?.text).toContain(
          'localhost'
        );
      });
    });

    describe('process_numbers', () => {
      it('should allow guest MCP session to execute JavaScript via process_numbers', async () => {
        const mcpSession = await initializeMcpSession();
        const response = await postMcp(
          {
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'process_numbers',
              arguments: {
                numbers: [1, 2, 3],
                processing_expression:
                  'numbers.reduce((acc, num) => acc + num, 0)'
              }
            },
            id: 9
          },
          {
            'Mcp-Session-Id': mcpSession.sessionId
          }
        );

        expect(response.status).toBe(200);
        expect(response.data?.error).toBeUndefined();
        expect(response.data?.result?.content?.[0]?.text).toContain(
          'SSJI result: 6'
        );
      });
    });

    describe('get_metadata', () => {
      it('should proxy XML payload to /api/metadata for guest MCP session', async () => {
        const mcpSession = await initializeMcpSession();
        const response = await postMcp(
          {
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'get_metadata',
              arguments: {
                xml: '<root><username>John</username></root>'
              }
            },
            id: 11
          },
          {
            'Mcp-Session-Id': mcpSession.sessionId
          }
        );

        expect(response.status).toBe(200);
        expect(response.data?.error).toBeUndefined();
        expect(response.data?.result?.content?.[0]?.text).toContain(
          '<username>John</username>'
        );
      });
    });

    describe('search_users', () => {
      it('should proxy /api/users/search/:name and return JSON text payload', async () => {
        const mcpSession = await initializeMcpSession();
        const response = await postMcp(
          {
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'search_users',
              arguments: {
                name: 'a'
              }
            },
            id: 12
          },
          {
            'Mcp-Session-Id': mcpSession.sessionId
          }
        );

        expect(response.status).toBe(200);
        expect(response.data?.error).toBeUndefined();

        const jsonText = response.data?.result?.content?.[0]?.text;
        expect(typeof jsonText).toBe('string');

        const parsed = JSON.parse(jsonText) as unknown;
        expect(Array.isArray(parsed)).toBe(true);
      });
    });

    describe('DELETE /mcp', () => {
      it('should terminate session and return 404 for later requests with same session id', async () => {
        const mcpSession = await initializeMcpSession();

        const deleteResponse = await axios.delete(mcpUrl, {
          headers: {
            'Mcp-Session-Id': mcpSession.sessionId
          },
          validateStatus: () => true
        });

        expect(deleteResponse.status).toBe(204);

        const afterDelete = await postMcp(
          {
            jsonrpc: '2.0',
            method: 'tools/list',
            id: 6
          },
          {
            'Mcp-Session-Id': mcpSession.sessionId
          }
        );

        expect(afterDelete.status).toBe(404);
        expect(afterDelete.data?.error?.code).toBe(-32002);
      });
    });
  });

  const describeSec = hasSecTesterCreds ? describe : describe.skip;

  describeSec('POST /mcp SecTester scans', () => {
    let runner: SecRunner;

    beforeEach(async () => {
      runner = new SecRunner({ hostname: process.env.BRIGHT_CLUSTER });
      await runner.init();
    });

    afterEach(() => runner.clear());

    describe('get_count', () => {
      it('should not execute commands for SQL database via MCP get_count', async () => {
        const mcpSession = await initializeMcpSession();

        await runner
          .createScan({
            tests: ['sqli'],
            name: expect.getState().currentTestName
          })
          .timeout(timeout)
          .run({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Mcp-Session-Id': mcpSession.sessionId
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'tools/call',
              params: {
                name: 'get_count',
                arguments: {
                  query: 'select count(*) as count from testimonial'
                }
              },
              id: 1
            }),
            url: mcpUrl
          });
      });
    });

    describe('get_config', () => {
      it('should not contain secret tokens leak via MCP get_config', async () => {
        const token = await loginForMcp('admin', 'admin');
        const mcpSession = await initializeMcpSession(token);

        await runner
          .createScan({
            tests: ['secret_tokens'],
            name: expect.getState().currentTestName
          })
          .timeout(timeout)
          .run({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Mcp-Session-Id': mcpSession.sessionId
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'tools/call',
              params: {
                name: 'get_config',
                arguments: {}
              },
              id: 1
            }),
            url: mcpUrl
          });
      });
    });

    describe('render', () => {
      it('should not contain possibility to server-side code execution via MCP render', async () => {
        const mcpSession = await initializeMcpSession();

        await runner
          .createScan({
            tests: ['ssti'],
            name: expect.getState().currentTestName
          })
          .timeout(timeout)
          .run({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Mcp-Session-Id': mcpSession.sessionId
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'tools/call',
              params: {
                name: 'render',
                arguments: {
                  numbers: [1, 2, 3],
                  template: 'Result: {{=it.sum}}'
                }
              },
              id: 1
            }),
            url: mcpUrl
          });
      });
    });
  });
});
