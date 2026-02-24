import {
  isConfigToolInput,
  isCountToolInput,
  isProcessNumbersToolInput,
  isRenderToolInput,
  McpTool
} from './api/mcp.types';

export type McpToolName =
  | 'count_tool'
  | 'config_tool'
  | 'render_tool'
  | 'process_numbers_tool';

export interface McpToolRegistration {
  definition: McpTool;
  validate: (args: unknown) => boolean;
  invalidArgsMessage: string;
  normalize?: (args: unknown) => unknown;
}

export const MCP_TOOL_REGISTRY: Record<McpToolName, McpToolRegistration> = {
  count_tool: {
    definition: {
      name: 'count_tool',
      description:
        'Proxy to /api/testimonials/count. Accepts a SQL query and returns count.',
      accessLevel: 'public',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'SQL query to execute for counting. Example: select count(*) as count from testimonial'
          }
        },
        required: ['query']
      }
    },
    validate: (args: unknown) => isCountToolInput(args),
    invalidArgsMessage:
      'Invalid arguments: count_tool requires a "query" string parameter'
  },

  config_tool: {
    definition: {
      name: 'config_tool',
      description:
        'Proxy to /api/config. Returns application configuration including database and cloud settings.',
      accessLevel: 'admin',
      inputSchema: {
        type: 'object',
        properties: {
          include_sensitive: {
            type: 'boolean',
            description:
              'Whether to include sensitive configuration data. Default: true'
          }
        },
        required: []
      }
    },
    validate: (args: unknown) => isConfigToolInput(args),
    invalidArgsMessage:
      'Invalid arguments: config_tool expects optional "include_sensitive" boolean parameter',
    normalize: (args: unknown) => args ?? {}
  },

  render_tool: {
    definition: {
      name: 'render_tool',
      description: 'Adds numbers and renders output via doT template.',
      accessLevel: 'public',
      inputSchema: {
        type: 'object',
        properties: {
          numbers: {
            type: 'array',
            items: { type: 'number' },
            description: 'Array of numbers to sum together'
          },
          template: {
            type: 'string',
            description: 'Custom doT template string'
          }
        },
        required: ['numbers']
      }
    },
    validate: (args: unknown) => isRenderToolInput(args),
    invalidArgsMessage:
      'Invalid arguments: render_tool requires a "numbers" array parameter'
  },

  process_numbers_tool: {
    definition: {
      name: 'process_numbers_tool',
      description:
        'Proxy to /api/process_numbers. Processes number arrays with a required expression.',
      accessLevel: 'public',
      inputSchema: {
        type: 'object',
        properties: {
          numbers: {
            type: 'array',
            items: { type: 'number' },
            description: 'Array of numbers to process'
          },
          processing_expression: {
            type: 'string',
            description: 'JavaScript expression to process "numbers"'
          }
        },
        required: ['numbers', 'processing_expression']
      }
    },
    validate: (args: unknown) => isProcessNumbersToolInput(args),
    invalidArgsMessage:
      'Invalid arguments: process_numbers_tool requires "numbers" array and non-empty "processing_expression" string'
  }
};

export const isMcpToolName = (value: string): value is McpToolName =>
  Object.prototype.hasOwnProperty.call(MCP_TOOL_REGISTRY, value);
