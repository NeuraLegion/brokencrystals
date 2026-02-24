import { Injectable, Logger } from '@nestjs/common';
import {
  McpResourceReadParams,
  McpResourceReadResult,
  McpTool,
  McpToolAccessLevel,
  McpToolCallParams,
  McpToolResult
} from './api/mcp.types';
import { isMcpToolName, MCP_TOOL_REGISTRY } from './mcp.tool-registry';
import { McpResourceExecutorService } from './mcp.resource-executor.service';
import {
  McpToolExecutionContext,
  McpToolExecutorService
} from './mcp.tool-executor.service';

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);

  constructor(
    private readonly toolExecutor: McpToolExecutorService,
    private readonly resourceExecutor: McpResourceExecutorService
  ) {}

  getTools(): McpTool[] {
    return Object.values(MCP_TOOL_REGISTRY).map(
      (registration) => registration.definition
    );
  }

  getToolAccessLevel(toolName: string): McpToolAccessLevel | undefined {
    if (!isMcpToolName(toolName)) {
      return undefined;
    }
    return MCP_TOOL_REGISTRY[toolName].definition.accessLevel;
  }

  getResources() {
    return this.resourceExecutor.getResources();
  }

  async callTool(
    params: McpToolCallParams,
    context: McpToolExecutionContext = {}
  ): Promise<McpToolResult> {
    const { name, arguments: args } = params;

    this.logger.debug(
      `Calling tool: ${name} with args: ${JSON.stringify(args)}`
    );

    if (!isMcpToolName(name)) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true
      };
    }

    const registration = MCP_TOOL_REGISTRY[name];
    if (!registration.validate(args)) {
      return {
        content: [{ type: 'text', text: registration.invalidArgsMessage }],
        isError: true
      };
    }

    const normalizedArgs = registration.normalize
      ? registration.normalize(args)
      : args;

    return this.toolExecutor.executeTool(name, normalizedArgs, context);
  }

  async readResource(
    params: McpResourceReadParams,
    context: McpToolExecutionContext = {}
  ): Promise<McpResourceReadResult> {
    const { uri } = params;

    this.logger.debug(`Reading resource URI: ${uri}`);

    return this.resourceExecutor.readLfiResource(
      uri,
      context.authorizationHeader
    );
  }
}
