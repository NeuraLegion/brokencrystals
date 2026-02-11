import { SecRunner } from '@sectester/runner';
import axios, { AxiosResponse } from 'axios';

const mcpUrl = `${process.env.SEC_TESTER_TARGET}/api/mcp`;
const authUrl = `${process.env.SEC_TESTER_TARGET}/api/auth/admin/login`;
const hasSecTesterCreds =
  !!process.env.BRIGHT_TOKEN && !!process.env.BRIGHT_CLUSTER;

type McpRole = 'guest' | 'user' | 'admin';

interface InitializedMcpSession {
  sessionId: string;
  authenticated: boolean;
  role: McpRole;
  user?: string;
}

const withBearer = (token: string): string =>
  token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`;

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

    describe('role-based access', () => {
      it('should deny admin-only tool for guest MCP session', async () => {
        const mcpSession = await initializeMcpSession();
        const response = await postMcp(
          {
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'config_tool',
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
              name: 'config_tool',
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
              name: 'config_tool',
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

    describe('count_tool', () => {
      it('should not execute commands for SQL database via MCP count_tool', async () => {
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
                name: 'count_tool',
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

    describe('config_tool', () => {
      it('should not contain secret tokens leak via MCP config_tool', async () => {
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
                name: 'config_tool',
                arguments: {}
              },
              id: 1
            }),
            url: mcpUrl
          });
      });
    });

    describe('render_tool', () => {
      it('should not contain possibility to server-side code execution via MCP render_tool', async () => {
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
                name: 'render_tool',
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
