import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// JSON-RPC 2.0 base types for MCP
export class McpRequest {
  @ApiProperty({ example: '2.0' })
  jsonrpc: string;

  @ApiProperty({ example: 'tools/call' })
  method: string;

  @ApiPropertyOptional()
  params?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 1 })
  id?: string | number;
}

export class McpError {
  @ApiProperty()
  code: number;

  @ApiProperty()
  message: string;

  @ApiPropertyOptional()
  data?: unknown;
}

export class McpResponse {
  @ApiProperty({ example: '2.0' })
  jsonrpc: string;

  @ApiPropertyOptional()
  result?: unknown;

  @ApiPropertyOptional({ type: () => McpError })
  error?: McpError;

  @ApiPropertyOptional()
  id?: string | number;
}

export interface McpServerInfo {
  name: string;
  version: string;
}

export interface McpSessionInfo {
  mcpSessionId: string;
  initializedAt: number;
  lastSeenAt: number;
  authenticated: boolean;
  role: 'guest' | 'user' | 'admin';
  ttlMs: number;
  user?: string;
}

export interface McpInitializeResult {
  protocolVersion: string;
  capabilities: {
    tools: Record<string, never>;
    resources?: Record<string, never>;
  };
  serverInfo: McpServerInfo;
  session?: McpSessionInfo;
}

// Tool definitions
export interface McpTool {
  name: string;
  description: string;
  accessLevel?: McpToolAccessLevel;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export type McpToolAccessLevel = 'public' | 'authenticated' | 'admin';

export interface McpToolCallParams {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpResourceReadParams {
  uri: string;
}

export interface McpResourceReadResult {
  contents: Array<{
    uri: string;
    mimeType?: string;
    text: string;
  }>;
}

export interface McpToolResult {
  content: Array<{
    type: string;
    text: string;
  }>;
  isError?: boolean;
}

// Tool-specific input types
export interface CountToolInput {
  query: string;
}

export interface ConfigToolInput {
  include_sensitive?: boolean;
}

export interface RenderToolInput {
  numbers: number[];
  template?: string;
}

export interface ProcessNumbersToolInput {
  numbers: number[];
  processing_expression: string;
}

// Type guards for runtime validation
export function isCountToolInput(args: unknown): args is CountToolInput {
  return (
    typeof args === 'object' &&
    args !== null &&
    'query' in args &&
    typeof (args as Record<string, unknown>).query === 'string'
  );
}

export function isConfigToolInput(args: unknown): args is ConfigToolInput {
  if (args === undefined || args === null) {
    return true; // All fields are optional
  }
  if (typeof args !== 'object') {
    return false;
  }
  if (
    'include_sensitive' in args &&
    typeof (args as Record<string, unknown>).include_sensitive !== 'boolean'
  ) {
    return false;
  }
  return true;
}

export function isRenderToolInput(args: unknown): args is RenderToolInput {
  if (typeof args !== 'object' || args === null) {
    return false;
  }
  const obj = args as Record<string, unknown>;
  if (!Array.isArray(obj.numbers)) {
    return false;
  }
  if (!obj.numbers.every((n: unknown) => typeof n === 'number')) {
    return false;
  }
  if ('template' in obj && typeof obj.template !== 'string') {
    return false;
  }
  return true;
}

export function isMcpResourceReadParams(
  params: unknown
): params is McpResourceReadParams {
  if (typeof params !== 'object' || params === null) {
    return false;
  }
  const obj = params as Record<string, unknown>;
  return typeof obj.uri === 'string' && obj.uri.trim().length > 0;
}

export function isProcessNumbersToolInput(
  args: unknown
): args is ProcessNumbersToolInput {
  if (typeof args !== 'object' || args === null) {
    return false;
  }

  const obj = args as Record<string, unknown>;
  if (!Array.isArray(obj.numbers)) {
    return false;
  }
  if (!obj.numbers.every((n: unknown) => typeof n === 'number')) {
    return false;
  }
  if (typeof obj.processing_expression !== 'string') {
    return false;
  }
  if (!obj.processing_expression.trim().length) {
    return false;
  }
  return true;
}
