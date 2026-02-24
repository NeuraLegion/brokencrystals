import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { McpResource, McpResourceReadResult } from './api/mcp.types';
import { McpProxySupport } from './mcp.proxy-support';

@Injectable()
export class McpResourceExecutorService extends McpProxySupport {
  private readonly logger = new Logger(McpResourceExecutorService.name);
  private static readonly MCP_RESOURCES: McpResource[] = [
    {
      uri: 'file:///etc/hosts',
      name: 'local_file',
      description:
        'Read local files by URI (example: file:///etc/passwd) via server-side /api/file/raw proxy.',
      mimeType: 'text/plain'
    }
  ];

  getResources(): McpResource[] {
    return [...McpResourceExecutorService.MCP_RESOURCES];
  }

  async readLfiResource(
    uri: string,
    authorizationHeader?: string
  ): Promise<McpResourceReadResult> {
    const parsed = new URL(uri);
    if (parsed.protocol !== 'file:') {
      throw new Error(`Unsupported resource URI protocol: ${parsed.protocol}`);
    }

    const filePath = decodeURIComponent(parsed.pathname || '');
    if (!filePath.length) {
      throw new Error('Invalid resource URI: file path is required');
    }

    try {
      this.logger.debug(`Reading file via MCP resource URI: ${uri}`);

      const endpoint = new URL(this.endpoint('/api/file/raw'));
      endpoint.searchParams.set('path', filePath);

      const response = await axios.get(endpoint.toString(), {
        headers: this.buildProxyHeaders(authorizationHeader),
        responseType: 'text',
        transformResponse: [(data: string) => data],
        validateStatus: () => true
      });

      if (response.status !== 200) {
        throw new Error(
          `Proxy error in lfi_resource: HTTP ${response.status} ${this.responseToText(response.data)}`
        );
      }

      const text =
        typeof response.data === 'string'
          ? response.data
          : String(response.data);

      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text
          }
        ]
      };
    } catch (error) {
      throw new Error((error as Error).message);
    }
  }
}
