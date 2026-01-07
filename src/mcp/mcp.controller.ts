import {
  Body,
  Controller,
  Post,
  Logger,
  Header,
  HttpCode
} from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiProduces,
  ApiConsumes
} from '@nestjs/swagger';
import { McpService } from './mcp.service';
import { McpRequest, McpResponse, McpToolCallParams } from './api/mcp.types';
import { API_DESC_MCP_ENDPOINT } from './mcp.controller.swagger.desc';

@Controller('/api/mcp')
@ApiTags('MCP Controller')
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(private readonly mcpService: McpService) {}

  @Post()
  @HttpCode(200)
  @ApiConsumes('application/json')
  @ApiProduces('application/json')
  @ApiOperation({
    description: API_DESC_MCP_ENDPOINT
  })
  @ApiBody({
    type: McpRequest,
    examples: {
      list_tools: {
        summary: 'List available tools',
        value: {
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1
        }
      },
      call_count_tool: {
        summary: 'Call count_tool',
        value: {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'count_tool',
            arguments: {
              query: 'select count(*) as count from testimonial'
            }
          },
          id: 2
        }
      },
      call_config_tool: {
        summary: 'Call config_tool',
        value: {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'config_tool',
            arguments: {
              include_sensitive: true
            }
          },
          id: 3
        }
      },
      call_render_tool: {
        summary: 'Call render_tool',
        value: {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'render_tool',
            arguments: {
              numbers: [1, 2, 3, 4, 5]
            }
          },
          id: 4
        }
      },
      call_render_tool_with_template: {
        summary: 'Call render_tool with custom template',
        value: {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'render_tool',
            arguments: {
              numbers: [10, 20, 30],
              template: 'Result: {{=it.sum}}'
            }
          },
          id: 5
        }
      }
    }
  })
  @ApiOkResponse({
    type: McpResponse,
    description: 'MCP JSON-RPC response'
  })
  @Header('content-type', 'application/json')
  async handleMcpRequest(@Body() request: McpRequest): Promise<McpResponse> {
    this.logger.debug(`MCP Request: ${JSON.stringify(request)}`);

    // Validate JSON-RPC version
    if (request.jsonrpc !== '2.0') {
      return {
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid Request: jsonrpc must be "2.0"'
        },
        id: request.id
      };
    }

    try {
      switch (request.method) {
        case 'tools/list':
          return this.handleToolsList(request);

        case 'tools/call':
          return await this.handleToolsCall(request);

        case 'initialize':
          // Return a minimal initialization response for compatibility
          return {
            jsonrpc: '2.0',
            result: {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: {}
              },
              serverInfo: {
                name: 'brokencrystals-mcp',
                version: '1.0.0'
              }
            },
            id: request.id
          };

        default:
          return {
            jsonrpc: '2.0',
            error: {
              code: -32601,
              message: `Method not found: ${request.method}`
            },
            id: request.id
          };
      }
    } catch (error) {
      this.logger.error(`MCP Error: ${error.message}`);
      return {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: `Internal error: ${error.message}`
        },
        id: request.id
      };
    }
  }

  private handleToolsList(request: McpRequest): McpResponse {
    const tools = this.mcpService.getTools();

    return {
      jsonrpc: '2.0',
      result: {
        tools
      },
      id: request.id
    };
  }

  private async handleToolsCall(request: McpRequest): Promise<McpResponse> {
    const params = request.params as unknown as McpToolCallParams;

    if (!params?.name) {
      return {
        jsonrpc: '2.0',
        error: {
          code: -32602,
          message: 'Invalid params: tool name is required'
        },
        id: request.id
      };
    }

    const result = await this.mcpService.callTool(params);

    return {
      jsonrpc: '2.0',
      result,
      id: request.id
    };
  }
}
