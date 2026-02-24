// Use IPv4 loopback explicitly. In some environments `localhost` resolves to `::1`
// while the server only listens on IPv4 (e.g. `0.0.0.0`), causing ECONNREFUSED.
const MCP_API_BASE_URL = 'http://127.0.0.1:3000/';

export abstract class McpProxySupport {
  protected endpoint(pathname: string): string {
    return new URL(pathname, MCP_API_BASE_URL).toString();
  }

  protected buildProxyHeaders(
    authorizationHeader?: string,
    contentType?: string
  ): Record<string, string> {
    const headers: Record<string, string> = {};
    if (authorizationHeader?.trim()) {
      headers.authorization = authorizationHeader;
    }
    if (contentType) {
      headers['content-type'] = contentType;
    }
    return headers;
  }

  protected responseToText(data: unknown): string {
    return typeof data === 'string' ? data : JSON.stringify(data);
  }
}
