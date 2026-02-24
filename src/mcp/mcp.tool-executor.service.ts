import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';
import * as dotT from 'dot';
import {
  ConfigToolInput,
  CountToolInput,
  McpToolResult,
  ProcessNumbersToolInput,
  RenderToolInput
} from './api/mcp.types';
import { McpProxySupport } from './mcp.proxy-support';
import { McpToolName } from './mcp.tool-registry';

export interface McpToolExecutionContext {
  authorizationHeader?: string;
}

@Injectable()
export class McpToolExecutorService extends McpProxySupport {
  private readonly logger = new Logger(McpToolExecutorService.name);

  async executeTool(
    toolName: McpToolName,
    args: unknown,
    context: McpToolExecutionContext = {}
  ): Promise<McpToolResult> {
    switch (toolName) {
      case 'count_tool':
        return this.executeCountTool(
          args as CountToolInput,
          context.authorizationHeader
        );
      case 'config_tool':
        return this.executeConfigTool(
          args as ConfigToolInput,
          context.authorizationHeader
        );
      case 'render_tool':
        return this.executeRenderTool(args as RenderToolInput);
      case 'process_numbers_tool':
        return this.executeProcessNumbersTool(
          args as ProcessNumbersToolInput,
          context.authorizationHeader
        );
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
        return this.proxyError('count_tool', response);
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
        return this.proxyError('config_tool', response);
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
      this.logger.debug('Processing crystals via MCP process_numbers_tool');

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
        return this.proxyError('process_numbers_tool', response);
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
