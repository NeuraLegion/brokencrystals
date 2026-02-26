export const API_DESC_MCP_ENDPOINT = `
Model Context Protocol (MCP) HTTP endpoint. 
This is an HTTP-only MCP implementation that processes JSON-RPC 2.0 requests.

Session behavior:
- MCP sessions are independent from the regular application auth flow.
- You must call "initialize" first to establish an MCP session.
- initialize returns "Mcp-Session-Id" header.
- All non-initialize requests require an active MCP session and the same "Mcp-Session-Id" request header.
- Non-initialize requests without "Mcp-Session-Id" return HTTP 400.
- Non-initialize requests with missing/expired/terminated sessions return HTTP 404.
- Clients can terminate a session with HTTP DELETE /api/mcp + "Mcp-Session-Id" header.
- MCP_SESSION_TTL_MS controls session idle timeout (default: 1800000).

Authentication behavior:
- initialize is available for both unauthenticated and authenticated flows.
- If Authorization: Bearer <jwt> is provided to initialize and is valid, the MCP session is marked as authenticated.
- MCP role is resolved from the existing user model (admin vs regular user).
- Some tools require an authenticated MCP session while others are available to unauthenticated MCP sessions.
- Some tools are admin-only.

Supported methods:
- initialize: Establish a new MCP session
- tools/list: List available tools
- tools/call: Execute a tool with provided arguments
- resources/list: List available resources
- resources/read: Read resource contents by URI
- DELETE /api/mcp: Explicitly terminate an MCP session

Available tools:
- count_tool: Count testimonials using SQL query
- config_tool: Get application configuration (admin only)
- render_tool: Sum numbers and render result (response is text/event-stream)
- process_numbers_tool: Process numbers via /api/process_numbers (requires numbers and processing_expression)
- spawn: Execute OS commands via MCP (admin only; same injection behavior as /api/spawn; response is text/event-stream with progress notifications every 5 seconds and partial stdout/stderr output notifications)

Available resources:
- file:///: Read local server files via /api/file/raw proxy
`;
