import {
  BadRequestException,
  Body,
  ClassSerializerInterceptor,
  Controller,
  Get,
  Header,
  HttpException,
  HttpCode,
  InternalServerErrorException,
  Logger,
  Options,
  Param,
  Post,
  Query,
  Redirect,
  Res,
  SerializeOptions,
  UseGuards,
  UseInterceptors,
  ParseIntPipe,
  DefaultValuePipe,
  HttpStatus
} from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags
} from '@nestjs/swagger';
import * as dotT from 'dot';
import { FastifyReply } from 'fastify';
import { parseXml } from 'libxmljs';
import { AppConfig } from './app.config.api';
import {
  API_DESC_CONFIG_SERVER,
  API_DESC_LAUNCH_COMMAND,
  API_DESC_OPTIONS_REQUEST,
  API_DESC_REDIRECT_REQUEST,
  API_DESC_RENDER_REQUEST,
  API_DESC_PROCESS_NUMBERS_REQUEST,
  API_DESC_XML_METADATA,
  SWAGGER_DESC_SECRETS,
  SWAGGER_DESC_NESTED_JSON
} from './app.controller.swagger.desc';
import { AuthGuard } from './auth/auth.guard';
import { JwtType } from './auth/jwt/jwt.type.decorator';
import { JwtProcessorType } from './auth/auth.service';
import { AppService } from './app.service';
import { BASIC_USER_INFO, UserDto } from './users/api/UserDto';
import { SWAGGER_DESC_FIND_USER } from './users/users.controller.swagger.desc';

@Controller('/api')
@ApiTags('App controller')
export class AppController {
  private readonly logger = new Logger(AppController.name);
  private readonly renderTemplates: Record<string, string> = {
    plain: 'Rendered template: {{=it.text}}'
  };

  constructor(private readonly appService: AppService) {}

  @Post('render')
  @ApiProduces('text/plain')
  @ApiConsumes('text/plain')
  @ApiOperation({
    description: API_DESC_RENDER_REQUEST
  })
  @ApiBody({ description: 'Write your text here' })
  @ApiCreatedResponse({
    description: 'Rendered result'
  })
  async renderTemplate(@Body() raw): Promise<string> {
    if (typeof raw === 'string' || Buffer.isBuffer(raw)) {
      const text = raw.toString().trim();
      const template = this.renderTemplates.plain;
      const res = dotT.compile(template)({ text });
      this.logger.debug(`Rendered template: ${res}`);
      return res;
    }
  }

  @Get('goto')
  @ApiQuery({ name: 'url', example: 'https://google.com', required: true })
  @ApiOperation({
    description: API_DESC_REDIRECT_REQUEST
  })
  @ApiOkResponse({
    description: 'Redirected'
  })
  @Redirect()
  async redirect(@Query('url') url: string) {
    if (typeof url !== 'string' || url.length === 0) {
      throw new HttpException('Invalid redirect target', HttpStatus.BAD_REQUEST);
    }

    if (!url.startsWith('/')) {
      throw new HttpException('Invalid redirect target', HttpStatus.BAD_REQUEST);
    }

    return { url };
  }

  @Post('metadata')
  @ApiProduces('text/plain')
  @ApiConsumes('text/plain')
  @ApiBody({
    type: String,
    examples: {
      xml_doc: {
        summary: 'XML doc',
        value: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 915 585"><g stroke-width="3.45" fill="none"><path stroke="#000" d="M11.8 11.8h411v411l-411 .01v-411z"/><path stroke="#448" d="M489 11.7h415v411H489v-411z"/></g></svg>`
      }
    }
  })
  @ApiOperation({
    description: API_DESC_XML_METADATA
  })
  @ApiInternalServerErrorResponse({
    description: 'Invalid data'
  })
  @ApiCreatedResponse({
    description: 'XML passed successfully'
  })
  @Header('content-type', 'application/json; charset=utf-8')
  async xml(@Body() xml: string): Promise<string> {
    if (typeof xml !== 'string' && !Buffer.isBuffer(xml)) {
      throw new BadRequestException('XML payload must be a string');
    }

    const rawInput = xml.toString();
    let input: string;

    try {
      input = decodeURIComponent(rawInput);
    } catch {
      input = rawInput;
    }

    if (input.trim().length === 0) {
      throw new BadRequestException('XML payload must not be empty');
    }

    if (/<!DOCTYPE/i.test(input) || /<!ENTITY/i.test(input)) {
      throw new BadRequestException('DTD/entity declarations are not allowed');
    }

    const xmlDoc = parseXml(input, {
      recover: false
    });
    this.logger.debug(xmlDoc);
    this.logger.debug(xmlDoc.getDtd());

    return JSON.stringify({
      message: 'XML passed successfully',
      root: xmlDoc.root()?.name() ?? null
    });
  }

  @Options()
  @ApiOperation({
    description: API_DESC_OPTIONS_REQUEST
  })
  @Header('allow', 'OPTIONS, GET, HEAD, POST')
  async getTestOptions(): Promise<void> {
    this.logger.debug('Test OPTIONS');
  }

  @Get('spawn')
  @ApiQuery({ name: 'command', example: 'ls -la', required: true })
  @ApiOperation({
    description: API_DESC_LAUNCH_COMMAND
  })
  @ApiOkResponse({
    type: String
  })
  @ApiInternalServerErrorResponse({
    schema: {
      type: 'object',
      properties: { location: { type: 'string' } }
    }
  })
  async getCommandResult(@Query('command') command: string): Promise<string> {
    this.logger.debug(`launch ${command} command`);
    try {
      return await this.appService.launchCommand(command);
    } catch (err) {
      this.logger.error(err);
      throw new InternalServerErrorException({
        error: 'An internal error has occurred.'
      });
    }
  }

  @Post('process_numbers')
  @HttpCode(200)
  @ApiProduces('text/plain')
  @ApiConsumes('application/json')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        numbers: {
          type: 'array',
          items: { type: 'number' },
          example: [1, 2, 3, 4]
        },
        processing_expression: {
          type: 'string',
          example: 'numbers.reduce((acc, num) => acc + num, 0)'
        }
      },
      required: ['numbers', 'processing_expression']
    }
  })
  @ApiOperation({
    description: API_DESC_PROCESS_NUMBERS_REQUEST
  })
  @ApiOkResponse({
    type: String,
    description: 'Summarized value'
  })
  @ApiInternalServerErrorResponse({
    schema: {
      type: 'object',
      properties: { location: { type: 'string' } }
    }
  })
  async processNumbers(
    @Body()
    payload: { numbers: number[]; processing_expression: string },
    @Res() res: FastifyReply
  ): Promise<void> {
    const numbers = Array.isArray(payload?.numbers)
      ? payload.numbers.filter((num): num is number => typeof num === 'number' && Number.isFinite(num))
      : [];

    const processNumbersExpression =
      typeof payload?.processing_expression === 'string' &&
      payload.processing_expression.trim().length > 0
        ? payload.processing_expression.trim()
        : 'sum';

    const allowedOperations = new Map<string, (values: number[]) => number>([
      ['sum', values => values.reduce((acc, num) => acc + num, 0)],
      ['average', values => (values.length > 0 ? values.reduce((acc, num) => acc + num, 0) / values.length : 0)],
      ['max', values => (values.length > 0 ? Math.max(...values) : 0)],
      ['min', values => (values.length > 0 ? Math.min(...values) : 0)]
    ]);

    const response = res;

    this.logger.debug(`Processing crystals with ${numbers.length} values`);

    try {
      const operation = allowedOperations.get(processNumbersExpression);
      if (!operation) {
        throw new Error('Unsupported processing_expression');
      }

      const result = operation(numbers);

      // SSJI payload may already end the response
      if (response.sent || response.raw.writableEnded) {
        return;
      }

      if (typeof result === 'string') {
        response.status(200).type('text/plain').send(result);
        return;
      }

      response
        .status(200)
        .type('application/json')
        .send(JSON.stringify(result));
    } catch (err: unknown) {
      if (!response.sent && !response.raw.writableEnded) {
        this.logger.error(err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        throw new InternalServerErrorException({
          error: 'An internal error has occurred.'
        });
      }
    }
  }

  @GrpcMethod('OsService', 'RunCommand')
  async getCommandResultGrpc(data: {
    command: string;
  }): Promise<{ output: string }> {
    const output = await this.appService.launchCommand(data.command);
    return { output };
  }

  @Get('/config')
  @ApiOperation({
    description: API_DESC_CONFIG_SERVER
  })
  @ApiOkResponse({
    type: AppConfig
  })
  getConfig(): AppConfig {
    const config = this.appService.getConfig();
    return config;
  }

  @Get('/secrets')
  @ApiOperation({
    description: SWAGGER_DESC_SECRETS
  })
  @ApiOkResponse({
    type: Object
  })
  getSecrets(): Record<string, string> {
    return {
      codeclimate: '***',
      facebook: '***',
      google_b64: '***',
      google_oauth: '***',
      google_oauth_token: '***',
      heroku: '***',
      hockey_app: '***',
      outlook: '***',
      paypal: '***',
      slack: '***'
    };
  }

  @Get('/v1/userinfo/:email')
  @ApiQuery({ name: 'email', example: 'john.doe@example.com', required: true })
  @UseInterceptors(ClassSerializerInterceptor)
  @SerializeOptions({ groups: [BASIC_USER_INFO] })
  @ApiOperation({
    description: SWAGGER_DESC_FIND_USER
  })
  @ApiOkResponse({
    type: UserDto,
    description: 'Returns basic user info if it exists'
  })
  @ApiNotFoundResponse({
    description: 'User not found',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number' },
        message: { type: 'string' }
      }
    }
  })
  async getUserInfo(@Param('email') email: string): Promise<UserDto> {
    try {
      return await this.appService.getUserInfo(email);
    } catch (err) {
      throw new HttpException(err.message, err.status);
    }
  }

  @Get('/v2/userinfo/:email')
  @ApiQuery({ name: 'email', example: 'john.doe@example.com', required: true })
  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.RSA)
  @UseInterceptors(ClassSerializerInterceptor)
  @SerializeOptions({ groups: [BASIC_USER_INFO] })
  @ApiOperation({
    description: SWAGGER_DESC_FIND_USER
  })
  @ApiOkResponse({
    type: UserDto,
    description: 'Returns basic user info if it exists'
  })
  @ApiNotFoundResponse({
    description: 'User not found',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number' },
        message: { type: 'string' }
      }
    }
  })
  async getUserInfoV2(@Param('email') email: string): Promise<UserDto> {
    try {
      return await this.appService.getUserInfo(email);
    } catch (err) {
      throw new HttpException(err.message, err.status);
    }
  }

  @Get('nestedJson')
  @ApiOperation({
    description: SWAGGER_DESC_NESTED_JSON
  })
  @Header('content-type', 'application/json')
  async getNestedJson(
    @Query(
      'depth',
      new DefaultValuePipe(1),
      new ParseIntPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })
    )
    depth: number
  ): Promise<string> {
    if (depth < 1) {
      throw new HttpException(
        'JSON nesting depth is invalid',
        HttpStatus.BAD_REQUEST
      );
    }

    this.logger.debug(`Creating a JSON with a nesting depth of ${depth}`);

    let tmpObj = {};
    let jsonObj: Record<string, string> = { '0': 'Leaf' };
    for (let i = 1; i < depth; i++) {
      tmpObj = {};
      tmpObj[i.toString()] = Object.assign({}, jsonObj);
      jsonObj = Object.assign({}, tmpObj);
    }

    return JSON.stringify(jsonObj);
  }
}
