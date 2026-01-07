export const API_DESC_MCP_ENDPOINT = `
Model Context Protocol (MCP) HTTP endpoint. 
This is a stateless HTTP-only MCP implementation that processes JSON-RPC 2.0 requests.

Supported methods:
- tools/list: List available tools
- tools/call: Execute a tool with provided arguments

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
