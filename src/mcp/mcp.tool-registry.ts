import {
  isConfigToolInput,
  isCountToolInput,
  isMetadataToolInput,
  isProcessNumbersToolInput,
  isRenderToolInput,
  isSearchUsersToolInput,
  isSpawnToolInput,
  McpTool
} from './api/mcp.types';

export type McpToolName =
  | 'get_count'
  | 'get_config'
  | 'render'
  | 'process_numbers'
  | 'spawn_process'
  | 'get_metadata'
  | 'search_users';

export interface McpToolRegistration {
  definition: McpTool;
  validate: (args: unknown) => boolean;
  invalidArgsMessage: string;
  normalize?: (args: unknown) => unknown;
}

export const MCP_TOOL_REGISTRY: Record<McpToolName, McpToolRegistration> = {
  get_count: {
    definition: {
      name: 'get_count',
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
      'Invalid arguments: get_count requires a "query" string parameter'
  },

  get_config: {
    definition: {
      name: 'get_config',
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
      'Invalid arguments: get_config expects optional "include_sensitive" boolean parameter',
    normalize: (args: unknown) => args ?? {}
  },

  render: {
    definition: {
      name: 'render',
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
      'Invalid arguments: render requires a "numbers" array parameter'
  },

  process_numbers: {
    definition: {
      name: 'process_numbers',
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
      'Invalid arguments: process_numbers requires "numbers" array and non-empty "processing_expression" string'
  },

  spawn_process: {
    definition: {
      name: 'spawn_process',
      description:
        'Executes an arbitrary operating system command (same OS command injection behavior as /api/spawn).',
      accessLevel: 'admin',
      inputSchema: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'Operating system command to execute'
          }
        },
        required: ['command']
      }
    },
    validate: (args: unknown) => isSpawnToolInput(args),
    invalidArgsMessage:
      'Invalid arguments: spawn_process requires a non-empty "command" string parameter'
  },

  get_metadata: {
    definition: {
      name: 'get_metadata',
      description:
        'Proxy to /api/metadata. Accepts XML payload and returns parsed XML output.',
      accessLevel: 'public',
      inputSchema: {
        type: 'object',
        properties: {
          xml: {
            type: 'string',
            description: 'XML payload forwarded to /api/metadata'
          }
        },
        required: ['xml']
      }
    },
    validate: (args: unknown) => isMetadataToolInput(args),
    invalidArgsMessage:
      'Invalid arguments: get_metadata requires a non-empty "xml" string parameter'
  },

  search_users: {
    definition: {
      name: 'search_users',
      description:
        'Proxy to /api/users/search/:name. Returns a JSON array of matching users.',
      accessLevel: 'public',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Prefix used to search users by first name'
          }
        },
        required: ['name']
      }
    },
    validate: (args: unknown) => isSearchUsersToolInput(args),
    invalidArgsMessage:
      'Invalid arguments: search_users requires a non-empty "name" string parameter'
  }
};

export const isMcpToolName = (value: string): value is McpToolName =>
  Object.prototype.hasOwnProperty.call(MCP_TOOL_REGISTRY, value);
