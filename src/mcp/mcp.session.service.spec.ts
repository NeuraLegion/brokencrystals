import { ConfigService } from '@nestjs/config';
import {
  MCP_SESSION_ID_ALGORITHMS,
  McpSessionIdAlgorithm,
  McpSessionService
} from './mcp.session.service';

describe('McpSessionService', () => {
  const uuidV1Pattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-1[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  const createService = (algorithm?: string) => {
    return new McpSessionService({
      get: jest.fn((key: string) =>
        key === 'MCP_SESSION_ID_ALGORITHM' ? algorithm : undefined
      )
    } as unknown as ConfigService);
  };

  it('should define five distinct MCP session id algorithms', () => {
    expect(MCP_SESSION_ID_ALGORITHMS).toHaveLength(5);
    expect(new Set(MCP_SESSION_ID_ALGORITHMS).size).toBe(5);
  });

  it.each<[McpSessionIdAlgorithm, (sessionIds: string[]) => void]>([
    [
      'prefixed-sequential',
      (sessionIds) =>
        expect(sessionIds).toEqual(['mcp-session-1', 'mcp-session-2'])
    ],
    [
      'static',
      (sessionIds) =>
        expect(sessionIds).toEqual(['mcp-session-static', 'mcp-session-static'])
    ],
    [
      'unix-second-with-counter',
      (sessionIds) => {
        expect(sessionIds[0]).toMatch(/^sec-ts-\d{10}-seq-1x$/);
        expect(sessionIds[1]).toMatch(/^sec-ts-\d{10}-seq-2x$/);
        expect(sessionIds[0].split('-seq-')[0]).toBe(
          sessionIds[1].split('-seq-')[0]
        );
      }
    ],
    [
      'uuid-v1',
      (sessionIds) => {
        expect(sessionIds[0]).toMatch(uuidV1Pattern);
        expect(sessionIds[1]).toMatch(uuidV1Pattern);
        expect(sessionIds[0]).not.toBe(sessionIds[1]);
      }
    ],
    [
      'fixed-mask-low-variety',
      (sessionIds) =>
        expect(sessionIds).toEqual([
          'mask-fixed-AA-tail-fixed',
          'mask-fixed-AB-tail-fixed'
        ])
    ]
  ])(
    'should initialize sessions with %s session ids',
    (algorithm, assertSessionIds) => {
      const service = createService(algorithm);

      const first = service.initializeSession({
        authenticated: false,
        role: 'guest'
      });
      const second = service.initializeSession({
        authenticated: false,
        role: 'guest'
      });

      expect(service.sessionIdAlgorithmName()).toBe(algorithm);
      assertSessionIds([first.sessionId, second.sessionId]);
    }
  );

  it('should choose one of the five algorithms when no algorithm is configured', () => {
    const service = createService();

    expect(MCP_SESSION_ID_ALGORITHMS).toContain(
      service.sessionIdAlgorithmName()
    );
  });

  it('should store sessions by generated session id', () => {
    const service = createService('prefixed-sequential');
    const session = service.initializeSession({
      authenticated: false,
      role: 'guest'
    });

    expect(service.touchSession(session.sessionId)).toBe(session);
  });
});
