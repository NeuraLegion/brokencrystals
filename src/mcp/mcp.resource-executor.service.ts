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
    },
    {
      uri: 'https://test-host.example.com/remote-payload',
      name: 'remote_file',
      description:
        'Read arbitrary remote HTTP(S) documents by URI and relay the raw body to the model in result.contents[].text.',
      mimeType: 'text/html'
    }
  ];

  getResources(): McpResource[] {
    return [...McpResourceExecutorService.MCP_RESOURCES];
  }

  async readResource(
    uri: string,
    authorizationHeader?: string
  ): Promise<McpResourceReadResult> {
    const parsed = new URL(uri);

    if (parsed.protocol === 'file:') {
      return this.readFileResource(uri, authorizationHeader);
    }

    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return this.readRemoteResource(uri);
    }

    throw new Error(`Unsupported resource URI protocol: ${parsed.protocol}`);
  }

  private async readFileResource(
    uri: string,
    authorizationHeader?: string
  ): Promise<McpResourceReadResult> {
    const parsed = new URL(uri);
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

  private async readRemoteResource(
    uri: string
  ): Promise<McpResourceReadResult> {
    try {
      this.logger.debug(`Reading remote MCP resource URI: ${uri}`);

      const response = await axios.get(uri, {
        responseType: 'text',
        transformResponse: [(data: string) => data],
        validateStatus: () => true
      });

      if (response.status < 200 || response.status >= 300) {
        throw new Error(
          `Proxy error in remote_file: HTTP ${response.status} ${this.responseToText(response.data)}`
        );
      }

      const text =
        typeof response.data === 'string'
          ? response.data
          : String(response.data);
      const mimeTypeHeader = response.headers['content-type'];
      const mimeType = Array.isArray(mimeTypeHeader)
        ? mimeTypeHeader[0]
        : mimeTypeHeader;

      return {
        contents: [
          {
            uri,
            mimeType:
              typeof mimeType === 'string' && mimeType.trim().length
                ? mimeType
                : 'text/plain',
            text
          }
        ]
      };
    } catch (error) {
      throw new Error((error as Error).message);
    }
  }
}
