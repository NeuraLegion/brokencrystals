export const API_DESC_MCP_ENDPOINT = `
Model Context Protocol (MCP) HTTP endpoint. 
This is an HTTP-only MCP implementation that processes JSON-RPC 2.0 requests.

Authentication and session behavior is controlled via env vars:
- MCP_AUTH_MODE=none|jwt|session (default: none)
- MCP_JWT_PROCESSOR (default: RSA)
- MCP_SESSION_TTL_MS (default: 1800000)

Auth modes:
- none: no auth required
- jwt: every request must include Authorization: Bearer <jwt>
- session: initialize (or any request) can authenticate via Authorization, then the server tracks an MCP session via cookie (connect.sid).

Supported methods:
- tools/list: List available tools
- tools/call: Execute a tool with provided arguments
 - initialize: Establish or refresh an MCP session

Available tools:
- count_tool: Count testimonials using SQL query
- config_tool: Get application configuration
- render_tool: Sum numbers and render result
`;

export const API_DESC_MCP_TOOLS_LIST = `
Returns the list of available MCP tools.
Each tool includes its name, description, and input schema.
`;

export const API_DESC_MCP_TOOLS_CALL = `
Executes an MCP tool with the provided arguments.
The tool name and arguments must be specified in the request body.
`;
