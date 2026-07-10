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
      'unix-millisecond-with-counter',
      (sessionIds) => {
        expect(sessionIds[0]).toMatch(/^ms-ts-\d{13}-seq-1x$/);
        expect(sessionIds[1]).toMatch(/^ms-ts-\d{13}-seq-2x$/);
        expect(sessionIds[0].split('-seq-')[0]).toBe(
          sessionIds[1].split('-seq-')[0]
        );
      }
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

  describe('delayed invalidation via scheduleTermination', () => {
    const DELAY_MS = 5 * 60 * 1000;

    const createServiceWithConfig = (config: {
      algorithm?: string;
      ttlMs?: string;
    }) =>
      new McpSessionService({
        get: jest.fn((key: string) => {
          if (key === 'MCP_SESSION_ID_ALGORITHM') {
            return config.algorithm;
          }
          if (key === 'MCP_SESSION_TTL_MS') {
            return config.ttlMs;
          }
          return undefined;
        })
      } as unknown as ConfigService);

    const initGuest = (service: McpSessionService) =>
      service.initializeSession({ authenticated: false, role: 'guest' });

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it('returns false when scheduling termination for an unknown session', () => {
      const service = createServiceWithConfig({
        algorithm: 'prefixed-sequential'
      });

      expect(service.scheduleTermination('does-not-exist')).toBe(false);
    });

    it('is idempotent and does not reschedule when called repeatedly', () => {
      const service = createServiceWithConfig({
        algorithm: 'prefixed-sequential'
      });
      const session = initGuest(service);
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      expect(service.scheduleTermination(session.sessionId)).toBe(true);
      expect(setTimeoutSpy).toHaveBeenCalledTimes(1);

      // A second call partway through the window must not arm a new timer.
      jest.advanceTimersByTime(DELAY_MS / 2);
      expect(service.scheduleTermination(session.sessionId)).toBe(true);
      expect(setTimeoutSpy).toHaveBeenCalledTimes(1);

      // The original schedule still fires DELAY_MS after the first call.
      jest.advanceTimersByTime(DELAY_MS / 2);
      expect(service.touchSession(session.sessionId)).toBeUndefined();
    });

    it('keeps the session usable before the delay and removes it afterwards', () => {
      const service = createServiceWithConfig({
        algorithm: 'prefixed-sequential'
      });
      const session = initGuest(service);

      expect(service.scheduleTermination(session.sessionId)).toBe(true);

      // Just before the delay elapses the session is still valid.
      jest.advanceTimersByTime(DELAY_MS - 1);
      expect(service.touchSession(session.sessionId)).toBeDefined();

      // Once the delay elapses the scheduled timer removes the session.
      jest.advanceTimersByTime(1);
      expect(service.touchSession(session.sessionId)).toBeUndefined();
    });

    it('clears the pending timer on terminateSession so a later session survives', () => {
      const service = createServiceWithConfig({
        algorithm: 'unix-millisecond-with-counter'
      });
      const session = initGuest(service);
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      expect(service.scheduleTermination(session.sessionId)).toBe(true);
      expect(service.terminateSession(session.sessionId)).toBe(true);
      expect(clearTimeoutSpy).toHaveBeenCalled();

      // The new session must not be wiped by the timer that was armed for the
      // terminated session.
      const next = initGuest(service);

      jest.advanceTimersByTime(DELAY_MS);
      expect(service.touchSession(next.sessionId)).toBeDefined();
    });

    it('clears the pending timer when a session expires via TTL', () => {
      const service = createServiceWithConfig({
        algorithm: 'unix-millisecond-with-counter',
        ttlMs: '1000'
      });
      const session = initGuest(service);
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      expect(service.scheduleTermination(session.sessionId)).toBe(true);
      const timerHandle = setTimeoutSpy.mock.results[0].value;

      // Advance beyond the TTL (1s) but not the 5-minute deletion delay.
      jest.advanceTimersByTime(2000);
      expect(service.touchSession(session.sessionId)).toBeUndefined();
      expect(clearTimeoutSpy).toHaveBeenCalledWith(timerHandle);
    });
  });
});
