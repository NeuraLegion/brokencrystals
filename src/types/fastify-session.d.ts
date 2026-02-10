import 'fastify';

declare module 'fastify' {
  interface Session {
    mcp?: {
      initializedAt: number;
      lastSeenAt: number;
      // User identifier captured at initialization (if auth is enabled).
      user?: string;
    };
  }
}
