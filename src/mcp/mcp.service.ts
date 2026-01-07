import { Injectable, Logger } from '@nestjs/common';
import * as dotT from 'dot';
import { TestimonialsService } from '../testimonials/testimonials.service';
import { AppService } from '../app.service';
import {
  McpTool,
  McpToolCallParams,
  McpToolResult,
  CountToolInput,
  ConfigToolInput,
  RenderToolInput,
  isCountToolInput,
  isConfigToolInput,
  isRenderToolInput
} from './api/mcp.types';

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);

  private readonly tools: McpTool[] = [
    {
      name: 'count_tool',
      description:
        'Counts testimonials in the database. Accepts a SQL query to count records.',
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
    {
      name: 'config_tool',
      description:
        'Returns application configuration including database and cloud settings.',
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
    {
      name: 'render_tool',
      description:
        'Adds numbers together and renders the result using a template engine. Optionally accepts a custom template.',
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
            description:
              'Custom template string. Use {{=it.sum}} to display the sum and {{=it.numbers}} for the numbers array'
          }
        },
        required: ['numbers']
      }
    }
  ];

  constructor(
    private readonly testimonialsService: TestimonialsService,
    private readonly appService: AppService
  ) {}

  getTools(): McpTool[] {
    return this.tools;
  }

  async callTool(params: McpToolCallParams): Promise<McpToolResult> {
    const { name, arguments: args } = params;

    this.logger.debug(
      `Calling tool: ${name} with args: ${JSON.stringify(args)}`
    );

    switch (name) {
      case 'count_tool':
        if (!isCountToolInput(args)) {
          return {
            content: [
              {
                type: 'text',
                text: 'Invalid arguments: count_tool requires a "query" string parameter'
              }
            ],
            isError: true
          };
        }
        return this.executeCountTool(args);
      case 'config_tool':
        if (!isConfigToolInput(args)) {
          return {
            content: [
              {
                type: 'text',
                text: 'Invalid arguments: config_tool expects optional "include_sensitive" boolean parameter'
              }
            ],
            isError: true
          };
        }
        return this.executeConfigTool(args ?? {});
      case 'render_tool':
        if (!isRenderToolInput(args)) {
          return {
            content: [
              {
                type: 'text',
                text: 'Invalid arguments: render_tool requires a "numbers" array parameter'
              }
            ],
            isError: true
          };
        }
        return this.executeRenderTool(args);
      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true
        };
    }
  }

  // SQL Injection vulnerability - directly passes user input to SQL query
  private async executeCountTool(
    input: CountToolInput
  ): Promise<McpToolResult> {
    try {
      this.logger.debug(`Executing count query: ${input.query}`);

      // Vulnerable: User-controlled SQL query passed directly to database
      const count = await this.testimonialsService.count(input.query);

      return {
        content: [
          {
            type: 'text',
            text: `Query result: ${count}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }

  // Data leakage - exposes sensitive configuration including database credentials
  private executeConfigTool(input: ConfigToolInput): McpToolResult {
    try {
      this.logger.debug('Fetching application configuration');

      // Vulnerable: Leaks sensitive configuration data including DB credentials
      const config = this.appService.getConfig();

      const includeSensitive = input?.include_sensitive !== false;

      if (includeSensitive) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(config, null, 2)
            }
          ]
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ awsBucket: config.awsBucket }, null, 2)
            }
          ]
        };
      }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }

  // SSTI vulnerability - uses dot template engine with user input
  private executeRenderTool(input: RenderToolInput): McpToolResult {
    try {
      this.logger.debug(
        `Rendering sum for numbers: ${JSON.stringify(input.numbers)}`
      );

      // Calculate sum
      const numbers = input.numbers || [];
      const sum = numbers.reduce((acc, num) => acc + num, 0);

      // Vulnerable: SSTI - User-controlled template string is directly compiled
      // Default template if not provided
      const template =
        input.template ||
        `The sum of [{{=it.numbers.join(', ')}}] is: {{=it.sum}}`;

      // Vulnerable: Using dot template engine which allows code execution
      // User can inject arbitrary code via the template parameter
      const rendered = dotT.compile(template)({ numbers, sum });

      this.logger.debug(`Rendered result: ${rendered}`);

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
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }
}
