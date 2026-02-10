import {
  Body,
  Controller,
  Post,
  Logger,
  Header,
  HttpCode,
  Req
} from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiProduces,
  ApiConsumes
} from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { McpService } from './mcp.service';
import { McpRequest, McpResponse, McpToolCallParams } from './api/mcp.types';
import { API_DESC_MCP_ENDPOINT } from './mcp.controller.swagger.desc';
import { McpAuthService } from './mcp.auth.service';

@Controller('/api/mcp')
@ApiTags('MCP Controller')
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(
    private readonly mcpService: McpService,
    private readonly mcpAuthService: McpAuthService
  ) {}

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
      initialize: {
        summary: 'Initialize session',
        value: {
          jsonrpc: '2.0',
          method: 'initialize',
          id: 0
        }
      },
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
  async handleMcpRequest(
    @Body() request: McpRequest,
    @Req() req: FastifyRequest
  ): Promise<McpResponse> {
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
      const authError = await this.ensureAuthorized(req, request);
      if (authError) {
        return authError;
      }

      switch (request.method) {
        case 'tools/list':
          return this.handleToolsList(request);

        case 'tools/call':
          return await this.handleToolsCall(request);

        case 'initialize':
          // Return an initialization response and establish (or refresh) an MCP session.
          await this.initializeSession(req);
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
              },
              session: {
                mode: this.mcpAuthService.mode(),
                ttlMs: this.mcpAuthService.sessionTtlMsValue(),
                sessionId: req.session?.sessionId,
                cookieName: 'connect.sid',
                cookieValue: req.session?.encryptedSessionId,
                user: req.session?.mcp?.user
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

  private rpcError(
    request: McpRequest,
    code: number,
    message: string,
    data?: unknown
  ): McpResponse {
    return {
      jsonrpc: '2.0',
      error: {
        code,
        message,
        data
      },
      id: request.id
    };
  }

  private async ensureAuthorized(
    req: FastifyRequest,
    request: McpRequest
  ): Promise<McpResponse | null> {
    const mode = this.mcpAuthService.mode();
    const now = Date.now();

    // No auth required. Still keep session timestamps if available.
    if (mode === 'none') {
      if (req.session?.mcp) {
        req.session.mcp.lastSeenAt = now;
        await req.session.save();
      }
      return null;
    }

    const token = this.mcpAuthService.extractBearerToken(req);

    if (mode === 'jwt') {
      if (!token) {
        return this.rpcError(
          request,
          -32001,
          'Unauthorized: missing Authorization header'
        );
      }
      try {
        const payload = await this.mcpAuthService.validateJwt(token);
        const user = this.mcpAuthService.extractUserId(payload);
        // Track activity in session for observability, but do not rely on it for auth.
        await this.mcpAuthService.ensureSession(req, { user, nowMs: now });
        return null;
      } catch (e) {
        return this.rpcError(request, -32001, 'Unauthorized: invalid token', {
          message: (e as Error).message
        });
      }
    }

    // mode === 'session'
    if (this.mcpAuthService.isSessionValid(req, now)) {
      await this.mcpAuthService.ensureSession(req, { nowMs: now });
      return null;
    }

    if (req.session?.mcp) {
      // Session exists but is expired/corrupt. Clear MCP-specific state so a fresh initialize can occur.
      await this.mcpAuthService.clearSession(req);
    }

    // If the session is missing/expired, allow re-auth via token on any call (including tools/call)
    // so non-cookie clients can still use the endpoint by attaching Authorization.
    if (!token) {
      return this.rpcError(
        request,
        -32002,
        'Session required: call initialize or provide Authorization header'
      );
    }

    try {
      const payload = await this.mcpAuthService.validateJwt(token);
      const user = this.mcpAuthService.extractUserId(payload);
      await this.mcpAuthService.ensureSession(req, { user, nowMs: now });
      return null;
    } catch (e) {
      return this.rpcError(request, -32001, 'Unauthorized: invalid token', {
        message: (e as Error).message
      });
    }
  }

  private async initializeSession(req: FastifyRequest): Promise<void> {
    const mode = this.mcpAuthService.mode();
    const now = Date.now();

    // For session auth, initialize is an explicit opportunity to start/refresh the session.
    // For jwt auth, we still maintain session timestamps (optional) for observability.
    if (mode === 'none') {
      await this.mcpAuthService.ensureSession(req, { nowMs: now });
      return;
    }

    const token = this.mcpAuthService.extractBearerToken(req);
    if (!token) {
      // No-op. Actual enforcement is performed by ensureAuthorized().
      return;
    }

    try {
      const payload = await this.mcpAuthService.validateJwt(token);
      const user = this.mcpAuthService.extractUserId(payload);
      await this.mcpAuthService.ensureSession(req, { user, nowMs: now });
    } catch {
      // No-op. ensureAuthorized() will return a JSON-RPC error for invalid tokens.
    }
  }
}
