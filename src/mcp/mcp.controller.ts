import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  Logger,
  NotFoundException,
  Post,
  Req,
  Res
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags
} from '@nestjs/swagger';
import { FastifyReply, FastifyRequest } from 'fastify';
import {
  isMcpResourceReadParams,
  McpInitializeResult,
  McpRequest,
  McpResponse,
  McpToolCallParams
} from './api/mcp.types';
import { McpAuthService } from './mcp.auth.service';
import { API_DESC_MCP_ENDPOINT } from './mcp.controller.swagger.desc';
import { McpService } from './mcp.service';
import { McpSessionService, McpSessionState } from './mcp.session.service';
import { McpToolPartialOutput } from './mcp.tool-executor.service';

interface SessionValidationResult {
  session?: McpSessionState;
  error?: McpResponse;
}

interface StreamedToolConfig {
  heartbeatMs: number;
  emitPartialOutput?: boolean;
  getMetadata?: (params: McpToolCallParams) => Record<string, unknown>;
}

interface ResolvedStreamedTool {
  name: string;
  config: StreamedToolConfig;
  metadata: Record<string, unknown>;
}

@Controller('/api/mcp')
@ApiTags('MCP Controller')
export class McpController {
  private static readonly MCP_SESSION_ID_HEADER = 'Mcp-Session-Id';
  private static readonly STREAMED_TOOLS: Record<string, StreamedToolConfig> = {
    spawn_process: {
      heartbeatMs: 5000,
      emitPartialOutput: true,
      getMetadata: (params) => ({
        command:
          typeof params.arguments?.command === 'string'
            ? params.arguments.command
            : undefined
      })
    }
  };
  private static readonly EVENT_STREAM_TOOLS = new Set<string>([
    'render',
    ...Object.keys(McpController.STREAMED_TOOLS)
  ]);

  private readonly logger = new Logger(McpController.name);

  constructor(
    private readonly mcpService: McpService,
    private readonly mcpAuthService: McpAuthService,
    private readonly mcpSessionService: McpSessionService
  ) {}

  @Post()
  @HttpCode(200)
  @ApiConsumes('application/json')
  @ApiProduces('application/json', 'text/event-stream')
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
      listTools: {
        summary: 'List available tools',
        value: {
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1
        }
      },
      call_get_count: {
        summary: 'Call get_count',
        value: {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'get_count',
            arguments: {
              query: 'select count(*) as count from testimonial'
            }
          },
          id: 2
        }
      },
      call_get_config: {
        summary: 'Call get_config',
        value: {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'get_config',
            arguments: {
              include_sensitive: true
            }
          },
          id: 3
        }
      },
      call_render: {
        summary: 'Call render',
        value: {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'render',
            arguments: {
              numbers: [1, 2, 3, 4, 5]
            }
          },
          id: 4
        }
      },
      call_render_with_template: {
        summary: 'Call render with custom template',
        value: {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'render',
            arguments: {
              numbers: [10, 20, 30],
              template: 'Result: {{=it.sum}}'
            }
          },
          id: 5
        }
      },
      list_resources: {
        summary: 'List resources',
        value: {
          jsonrpc: '2.0',
          method: 'resources/list',
          id: 6
        }
      },
      read_resource: {
        summary: 'Read resource',
        value: {
          jsonrpc: '2.0',
          method: 'resources/read',
          params: {
            uri: 'file:///etc/hosts'
          },
          id: 7
        }
      },
      call_process_numbers: {
        summary: 'Call process_numbers',
        value: {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'process_numbers',
            arguments: {
              numbers: [1, 2, 3, 4],
              processing_expression:
                'numbers.reduce((acc, num) => acc + num, 0)'
            }
          },
          id: 8
        }
      },
      call_get_metadata: {
        summary: 'Call get_metadata',
        value: {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'get_metadata',
            arguments: {
              xml: '<root><username>John</username></root>'
            }
          },
          id: 9
        }
      },
      call_spawn_process: {
        summary: 'Call spawn_process',
        value: {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'spawn_process',
            arguments: {
              command: 'uname -a'
            }
          },
          id: 10
        }
      },
      call_search_users: {
        summary: 'Call search_users',
        value: {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'search_users',
            arguments: {
              name: 'ad'
            }
          },
          id: 11
        }
      }
    }
  })
  @ApiOkResponse({
    type: McpResponse,
    description: 'MCP JSON-RPC response'
  })
  async handleMcpRequest(
    @Body() request: McpRequest,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply
  ): Promise<McpResponse | string | undefined> {
    this.logger.debug(`MCP Request: ${JSON.stringify(request)}`);

    if (request.jsonrpc !== '2.0') {
      return this.rpcError(
        request,
        -32600,
        'Invalid Request: jsonrpc must be "2.0"'
      );
    }

    try {
      if (request.method === 'initialize') {
        return await this.handleInitialize(request, req, res);
      }

      const validation = this.ensureActiveSession(req, request, res);
      if (validation.error) {
        return validation.error;
      }

      const session = validation.session;
      if (!session) {
        res.status(400);
        return this.rpcError(
          request,
          -32603,
          'Internal error: MCP session state is missing'
        );
      }

      switch (request.method) {
        case 'tools/list':
          return this.handleToolsList(request);

        case 'tools/call':
          return await this.handleToolsCall(request, session, res);

        case 'resources/list':
          return this.handleResourcesList(request);

        case 'resources/read':
          return await this.handleResourcesRead(request, session);

        default:
          return this.rpcError(
            request,
            -32601,
            `Method not found: ${request.method}`
          );
      }
    } catch (error) {
      this.logger.error(`MCP Error: ${(error as Error).message}`);
      return this.rpcError(
        request,
        -32603,
        `Internal error: ${(error as Error).message}`
      );
    }
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({
    summary: 'Terminate an MCP session by Mcp-Session-Id'
  })
  @ApiNoContentResponse({
    description: 'Session terminated'
  })
  async terminateMcpSession(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply
  ): Promise<void> {
    const sessionId = this.extractMcpSessionId(req);
    if (!sessionId) {
      throw new BadRequestException(
        'MCP session id missing: send Mcp-Session-Id header'
      );
    }

    const terminated = this.mcpSessionService.terminateSession(sessionId);
    if (!terminated) {
      throw new NotFoundException(
        'MCP session not found: call initialize to create a new session'
      );
    }

    res.status(204);
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

  private handleResourcesList(request: McpRequest): McpResponse {
    const resources = this.mcpService.getResources();

    return {
      jsonrpc: '2.0',
      result: {
        resources
      },
      id: request.id
    };
  }

  private async handleResourcesRead(
    request: McpRequest,
    session: McpSessionState
  ): Promise<McpResponse> {
    const params = request.params;
    if (!isMcpResourceReadParams(params)) {
      return this.rpcError(
        request,
        -32602,
        'Invalid params: resources/read requires a "uri" string parameter'
      );
    }

    try {
      const result = await this.mcpService.readResource(params, {
        authorizationHeader: session.authorizationHeader
      });

      return {
        jsonrpc: '2.0',
        result,
        id: request.id
      };
    } catch (error) {
      return this.rpcError(
        request,
        -32603,
        `Internal error: ${(error as Error).message}`
      );
    }
  }

  private async handleToolsCall(
    request: McpRequest,
    session: McpSessionState,
    res: FastifyReply
  ): Promise<McpResponse | string | undefined> {
    const params = request.params as unknown as McpToolCallParams;

    if (!params?.name) {
      return this.rpcError(
        request,
        -32602,
        'Invalid params: tool name is required'
      );
    }

    const shouldStream = this.isEventStreamTool(params.name);

    if (!this.isToolAllowedForSession(params.name, session)) {
      const errorResponse = this.rpcError(
        request,
        -32001,
        this.buildToolAccessError(params.name, session)
      );

      return shouldStream
        ? this.toEventStreamMessage(res, errorResponse)
        : errorResponse;
    }

    const streamedTool = this.resolveStreamedTool(params);
    if (shouldStream && streamedTool) {
      await this.streamToolCall(request, params, session, res, streamedTool);
      return;
    }

    const response = await this.toRpcToolResponse(request, params, session);

    return shouldStream ? this.toEventStreamMessage(res, response) : response;
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

  private async handleInitialize(
    request: McpRequest,
    req: FastifyRequest,
    res: FastifyReply
  ): Promise<McpResponse> {
    try {
      const auth = await this.mcpAuthService.resolveAuthContext(req);
      const sessionState = this.mcpSessionService.initializeSession(auth);

      const result: McpInitializeResult = {
        protocolVersion: '2025-11-25',
        capabilities: {
          tools: {},
          resources: {}
        },
        serverInfo: {
          name: 'brokencrystals-mcp',
          version: '1.0.0'
        },
        session: {
          mcpSessionId: sessionState.sessionId,
          initializedAt: sessionState.initializedAt,
          lastSeenAt: sessionState.lastSeenAt,
          authenticated: sessionState.authenticated,
          role: sessionState.role,
          ttlMs: this.mcpSessionService.sessionTtlMsValue(),
          user: sessionState.user
        }
      };

      res.header(McpController.MCP_SESSION_ID_HEADER, sessionState.sessionId);

      return {
        jsonrpc: '2.0',
        result,
        id: request.id
      };
    } catch (e) {
      return this.rpcError(request, -32001, 'Unauthorized: invalid token', {
        message: (e as Error).message
      });
    }
  }

  private ensureActiveSession(
    req: FastifyRequest,
    request: McpRequest,
    res: FastifyReply
  ): SessionValidationResult {
    const sessionId = this.extractMcpSessionId(req);
    if (!sessionId) {
      res.status(400);
      return {
        error: this.rpcError(
          request,
          -32002,
          'MCP session id missing: send Mcp-Session-Id returned by initialize'
        )
      };
    }

    const session = this.mcpSessionService.touchSession(sessionId);
    if (!session) {
      res.status(404);
      return {
        error: this.rpcError(
          request,
          -32002,
          'MCP session not found: call initialize again'
        )
      };
    }

    return {
      session
    };
  }

  private extractMcpSessionId(req: FastifyRequest): string | undefined {
    const raw = req.headers[
      McpController.MCP_SESSION_ID_HEADER.toLowerCase()
    ] as string | string[] | undefined;

    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    if (!trimmed.length) {
      return undefined;
    }

    return /^[\x21-\x7E]+$/.test(trimmed) ? trimmed : undefined;
  }

  private isEventStreamTool(toolName: string): boolean {
    return McpController.EVENT_STREAM_TOOLS.has(toolName);
  }

  private toEventStreamMessage(
    res: FastifyReply,
    payload: McpResponse
  ): string {
    res.header('content-type', 'text/event-stream; charset=utf-8');
    res.header('cache-control', 'no-cache');
    res.header('connection', 'keep-alive');
    return `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
  }

  private async streamToolCall(
    request: McpRequest,
    params: McpToolCallParams,
    session: McpSessionState,
    res: FastifyReply,
    streamedTool: ResolvedStreamedTool
  ): Promise<void> {
    const startedAt = Date.now();

    this.startEventStream(res);
    this.sendProgressNotification(res, streamedTool, 'starting', startedAt);

    const heartbeat = setInterval(() => {
      this.sendProgressNotification(res, streamedTool, 'running', startedAt);
    }, streamedTool.config.heartbeatMs);

    heartbeat.unref?.();

    try {
      const onPartialOutput = streamedTool.config.emitPartialOutput
        ? (chunk: McpToolPartialOutput) =>
            this.sendPartialOutputNotification(
              res,
              streamedTool,
              chunk,
              startedAt
            )
        : undefined;

      const response = await this.toRpcToolResponse(
        request,
        params,
        session,
        onPartialOutput
      );
      this.writeEventStreamEvent(res, 'message', response);
    } finally {
      clearInterval(heartbeat);
      if (!res.raw.writableEnded) {
        res.raw.end();
      }
    }
  }

  private async toRpcToolResponse(
    request: McpRequest,
    params: McpToolCallParams,
    session: McpSessionState,
    onPartialOutput?: (chunk: McpToolPartialOutput) => void
  ): Promise<McpResponse> {
    try {
      const result = await this.mcpService.callTool(params, {
        authorizationHeader: session.authorizationHeader,
        onPartialOutput
      });

      return {
        jsonrpc: '2.0',
        result,
        id: request.id
      };
    } catch (error) {
      return this.rpcError(
        request,
        -32603,
        `Internal error: ${(error as Error).message}`
      );
    }
  }

  private resolveStreamedTool(
    params: McpToolCallParams
  ): ResolvedStreamedTool | undefined {
    const config = McpController.STREAMED_TOOLS[params.name];
    if (!config) {
      return undefined;
    }

    return {
      name: params.name,
      config,
      metadata: config.getMetadata ? config.getMetadata(params) : {}
    };
  }

  private sendProgressNotification(
    res: FastifyReply,
    streamedTool: ResolvedStreamedTool,
    status: 'starting' | 'running',
    startedAt: number
  ): void {
    const params =
      status === 'starting'
        ? {
            tool: streamedTool.name,
            ...streamedTool.metadata,
            status,
            startedAt
          }
        : {
            tool: streamedTool.name,
            ...streamedTool.metadata,
            status,
            elapsedMs: Date.now() - startedAt
          };

    this.writeNotification(res, 'notifications/progress', params);
  }

  private sendPartialOutputNotification(
    res: FastifyReply,
    streamedTool: ResolvedStreamedTool,
    output: McpToolPartialOutput,
    startedAt: number
  ): void {
    this.writeNotification(res, 'notifications/partial_output', {
      tool: streamedTool.name,
      ...streamedTool.metadata,
      stream: output.source,
      text: output.text,
      elapsedMs: Date.now() - startedAt
    });
  }

  private writeNotification(
    res: FastifyReply,
    method: string,
    params: Record<string, unknown>
  ): void {
    this.writeEventStreamEvent(res, 'notification', {
      jsonrpc: '2.0',
      method,
      params
    });
  }

  private startEventStream(res: FastifyReply): void {
    const hijackable = res as FastifyReply & { hijack?: () => void };
    if (typeof hijackable.hijack === 'function') {
      hijackable.hijack();
    }

    res.raw.statusCode = 200;
    res.raw.setHeader('content-type', 'text/event-stream; charset=utf-8');
    res.raw.setHeader('cache-control', 'no-cache');
    res.raw.setHeader('connection', 'keep-alive');

    if (typeof res.raw.flushHeaders === 'function') {
      res.raw.flushHeaders();
    }
  }

  private writeEventStreamEvent(
    res: FastifyReply,
    event: string,
    payload: unknown
  ): void {
    if (res.raw.writableEnded) {
      return;
    }
    res.raw.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  }

  private isToolAllowedForSession(
    toolName: string,
    session: McpSessionState
  ): boolean {
    const accessLevel = this.mcpService.getToolAccessLevel(toolName);

    if (!accessLevel || accessLevel === 'public') {
      return true;
    }

    if (accessLevel === 'authenticated') {
      return session.authenticated;
    }

    return session.authenticated && session.role === 'admin';
  }

  private buildToolAccessError(
    toolName: string,
    session: McpSessionState
  ): string {
    const accessLevel = this.mcpService.getToolAccessLevel(toolName);

    if (accessLevel === 'authenticated') {
      return `Unauthorized: tool "${toolName}" requires an authenticated MCP session`;
    }

    if (accessLevel === 'admin') {
      if (!session.authenticated) {
        return `Unauthorized: tool "${toolName}" requires authentication`;
      }
      return `Forbidden: tool "${toolName}" requires admin role`;
    }

    return `Unauthorized: access denied for tool "${toolName}"`;
  }
}
