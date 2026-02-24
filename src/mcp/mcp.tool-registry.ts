import {
  isFetchToolInput,
  isConfigToolInput,
  isCountToolInput,
  isRenderToolInput,
  isSummarizeToolInput,
  McpTool
} from './api/mcp.types';

export type McpToolName =
  | 'count_tool'
  | 'config_tool'
  | 'render_tool'
  | 'fetch_tool'
  | 'summarize_tool';

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

  fetch_tool: {
    definition: {
      name: 'fetch_tool',
      description:
        'Fetches any URL from the MCP server process and returns raw response data.',
      accessLevel: 'public',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description:
              'Absolute URL to request from the MCP server process (for example http://127.0.0.1:3000/api/config)'
          },
          method: {
            type: 'string',
            description: 'Optional HTTP method. Default: GET'
          },
          body: {
            type: 'string',
            description: 'Optional raw request body to forward'
          }
        },
        required: ['url']
      }
    },
    validate: (args: unknown) => isFetchToolInput(args),
    invalidArgsMessage:
      'Invalid arguments: fetch_tool requires a "url" string and optional "method"/"body" strings'
  },

  summarize_tool: {
    definition: {
      name: 'summarize_tool',
      description:
        'Proxy to /api/summarize_cristals. Summarizes number arrays with a required expression.',
      accessLevel: 'public',
      inputSchema: {
        type: 'object',
        properties: {
          numbers: {
            type: 'array',
            items: { type: 'number' },
            description: 'Array of numbers to summarize'
          },
          summarize_expression: {
            type: 'string',
            description:
              'JavaScript expression to calculate summary over "numbers"'
          }
        },
        required: ['numbers', 'summarize_expression']
      }
    },
    validate: (args: unknown) => isSummarizeToolInput(args),
    invalidArgsMessage:
      'Invalid arguments: summarize_tool requires "numbers" array and non-empty "summarize_expression" string'
  }
};

export const isMcpToolName = (value: string): value is McpToolName =>
  Object.prototype.hasOwnProperty.call(MCP_TOOL_REGISTRY, value);
