import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';
import { spawn } from 'child_process';
import * as dotT from 'dot';
import {
  ConfigToolInput,
  CountToolInput,
  MetadataToolInput,
  McpToolResult,
  ProcessNumbersToolInput,
  RenderToolInput,
  SearchUsersToolInput,
  SpawnToolInput,
  UpdateUserToolInput
} from './api/mcp.types';
import { McpProxySupport } from './mcp.proxy-support';
import { McpToolName } from './mcp.tool-registry';

export interface McpToolExecutionContext {
  authorizationHeader?: string;
  onPartialOutput?: (chunk: McpToolPartialOutput) => void;
}

export interface McpToolPartialOutput {
  source: 'stdout' | 'stderr';
  text: string;
}

@Injectable()
export class McpToolExecutorService extends McpProxySupport {
  private readonly logger = new Logger(McpToolExecutorService.name);
  private static readonly UPDATE_USER_ALLOWED_FIELDS = [
    'name',
    'email',
    'username',
    'phone',
    'role'
  ] as const;

  async executeTool(
    toolName: McpToolName,
    args: unknown,
    context: McpToolExecutionContext = {}
  ): Promise<McpToolResult> {
    switch (toolName) {
      case 'get_count':
        return this.executeCountTool(
          args as CountToolInput,
          context.authorizationHeader
        );
      case 'get_config':
        return this.executeConfigTool(
          args as ConfigToolInput,
          context.authorizationHeader
        );
      case 'render':
        return this.executeRenderTool(args as RenderToolInput);
      case 'process_numbers':
        return this.executeProcessNumbersTool(
          args as ProcessNumbersToolInput,
          context.authorizationHeader
        );
      case 'spawn_process':
        return this.executeSpawnTool(args as SpawnToolInput, context);
      case 'get_metadata':
        return this.executeMetadataTool(
          args as MetadataToolInput,
          context.authorizationHeader
        );
      case 'search_users':
        return this.executeSearchUsersTool(
          args as SearchUsersToolInput,
          context.authorizationHeader
        );
      case 'update_user':
        return this.executeUpdateUserTool(args as UpdateUserToolInput);
    }
  }

  private async executeCountTool(
    input: CountToolInput,
    authorizationHeader?: string
  ): Promise<McpToolResult> {
    try {
      this.logger.debug('Proxy count query via /api/testimonials/count');

      const endpoint = new URL(this.endpoint('/api/testimonials/count'));
      endpoint.searchParams.set('query', input.query);

      const response = await axios.get(endpoint.toString(), {
        headers: this.buildProxyHeaders(authorizationHeader),
        responseType: 'text',
        transformResponse: [(data: string) => data],
        validateStatus: () => true
      });

      if (response.status !== 200) {
        return this.proxyError('get_count', response);
      }

      const text =
        typeof response.data === 'string'
          ? response.data.trim()
          : String(response.data);

      return {
        content: [
          {
            type: 'text',
            text: `Query result: ${text}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        isError: true
      };
    }
  }

  private async executeConfigTool(
    input: ConfigToolInput,
    authorizationHeader?: string
  ): Promise<McpToolResult> {
    try {
      this.logger.debug('Proxy config via /api/config');

      const response = await axios.get(this.endpoint('/api/config'), {
        headers: this.buildProxyHeaders(authorizationHeader),
        validateStatus: () => true
      });

      if (response.status !== 200) {
        return this.proxyError('get_config', response);
      }

      const config =
        response.data && typeof response.data === 'object'
          ? (response.data as Record<string, unknown>)
          : {};

      const includeSensitive = input?.include_sensitive !== false;
      const output = includeSensitive
        ? config
        : {
            awsBucket: config.awsBucket
          };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(output, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        isError: true
      };
    }
  }

  private executeRenderTool(input: RenderToolInput): McpToolResult {
    try {
      this.logger.debug(
        `Rendering sum for numbers: ${JSON.stringify(input.numbers)}`
      );

      const numbers = input.numbers || [];
      const sum = numbers.reduce((acc, num) => acc + num, 0);
      const template =
        input.template ||
        "The sum of [{{=it.numbers.join(', ')}}] is: {{=it.sum}}";

      const rendered = dotT.compile(template)({ numbers, sum });

      return {
        content: [
          {
            type: 'text',
            text: rendered
          }
        ]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        isError: true
      };
    }
  }

  private async executeProcessNumbersTool(
    input: ProcessNumbersToolInput,
    authorizationHeader?: string
  ): Promise<McpToolResult> {
    try {
      this.logger.debug('Processing crystals via MCP process_numbers');

      const response = await axios.post(
        this.endpoint('/api/process_numbers'),
        {
          numbers: input.numbers,
          processing_expression: input.processing_expression
        },
        {
          headers: this.buildProxyHeaders(
            authorizationHeader,
            'application/json'
          ),
          responseType: 'text',
          transformResponse: [(data: string) => data],
          validateStatus: () => true
        }
      );

      if (response.status !== 200) {
        return this.proxyError('process_numbers', response);
      }

      const text =
        typeof response.data === 'string'
          ? response.data
          : String(response.data);

      return {
        content: [
          {
            type: 'text',
            text: `SSJI result: ${text}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        isError: true
      };
    }
  }

  private async executeSpawnTool(
    input: SpawnToolInput,
    context: McpToolExecutionContext = {}
  ): Promise<McpToolResult> {
    try {
      this.logger.debug('Executing OS command via MCP spawn_process');

      const [exec, ...args] = input.command.split(' ');
      if (!exec || !exec.trim().length) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: spawn_process command is empty'
            }
          ],
          isError: true
        };
      }

      const text = await new Promise<string>((resolve, reject) => {
        const process = spawn(exec, args);
        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data: Buffer) => {
          const text = data.toString('utf-8');
          stdout += text;
          context.onPartialOutput?.({ source: 'stdout', text });
        });

        process.stderr.on('data', (data: Buffer) => {
          const text = data.toString('utf-8');
          stderr += text;
          context.onPartialOutput?.({ source: 'stderr', text });
        });

        process.on('error', (error) => reject(error));
        process.on('close', (code) => {
          const output = (stdout || stderr).trim();
          if (output.length) {
            resolve(output);
            return;
          }

          resolve(
            code === 0 ? '(no output)' : `process exited with code ${code}`
          );
        });
      });

      return {
        content: [
          {
            type: 'text',
            text: `OS command result: ${text}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        isError: true
      };
    }
  }

  private async executeMetadataTool(
    input: MetadataToolInput,
    authorizationHeader?: string
  ): Promise<McpToolResult> {
    try {
      this.logger.debug('Proxy metadata via /api/metadata');

      const response = await axios.post(
        this.endpoint('/api/metadata'),
        input.xml,
        {
          headers: this.buildProxyHeaders(authorizationHeader, 'text/plain'),
          responseType: 'text',
          transformResponse: [(data: string) => data],
          validateStatus: () => true
        }
      );

      if (response.status < 200 || response.status >= 300) {
        return this.proxyError('get_metadata', response);
      }

      const text =
        typeof response.data === 'string'
          ? response.data
          : String(response.data);

      return {
        content: [
          {
            type: 'text',
            text
          }
        ]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        isError: true
      };
    }
  }

  private async executeSearchUsersTool(
    input: SearchUsersToolInput,
    authorizationHeader?: string
  ): Promise<McpToolResult> {
    try {
      this.logger.debug('Proxy users search via /api/users/search/:name');

      const response = await axios.get(
        this.endpoint(`/api/users/search/${encodeURIComponent(input.name)}`),
        {
          headers: {
            ...this.buildProxyHeaders(authorizationHeader),
            accept: 'application/json'
          },
          responseType: 'json',
          validateStatus: () => true
        }
      );

      if (response.status !== 200) {
        return this.proxyError('search_users', response);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        isError: true
      };
    }
  }

  private executeUpdateUserTool(input: UpdateUserToolInput): McpToolResult {
    this.logger.debug('Demonstrating prototype pollution via MCP tool');
    try {
      const payload = input.payload;
      const allowedFields = this.pickAllowedUpdateUserFields(payload);
      const protoFields = this.extractPrototypePayloadFields(payload);

      return {
        ...allowedFields,
        ...protoFields
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        isError: true
      };
    }
  }

  private extractPrototypePayloadFields(
    payload: Record<string, unknown>
  ): Record<string, unknown> {
    return payload['__proto__'] as Record<string, unknown>;
  }

  private pickAllowedUpdateUserFields(
    parsedRecord: Record<string, unknown>
  ): Record<string, unknown> {
    const allowedFields: Record<string, unknown> = {};

    for (const field of McpToolExecutorService.UPDATE_USER_ALLOWED_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(parsedRecord, field)) {
        allowedFields[field] = parsedRecord[field];
      }
    }

    return allowedFields;
  }

  private proxyError(toolName: string, response: AxiosResponse): McpToolResult {
    return {
      content: [
        {
          type: 'text',
          text: `Proxy error in ${toolName}: HTTP ${response.status} ${this.responseToText(response.data)}`
        }
      ],
      isError: true
    };
  }
}
