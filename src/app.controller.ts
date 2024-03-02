import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Get,
  Header,
  HttpException,
  InternalServerErrorException,
  Logger,
  Options,
  Param,
  Post,
  Query,
  Redirect,
  SerializeOptions,
  UseGuards,
  UseInterceptors,
  ParseIntPipe,
  DefaultValuePipe,
  HttpStatus,
} from '@nestjs/common';
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
  ApiTags,
} from '@nestjs/swagger';
import * as dotT from 'dot';
import { parseXml } from 'libxmljs';
import { AppConfig } from './app.config.api';
import {
  API_DESC_CONFIG_SERVER,
  API_DESC_LAUNCH_COMMAND,
  API_DESC_OPTIONS_REQUEST,
  API_DESC_REDIRECT_REQUEST,
  API_DESC_RENDER_REQUEST,
  API_DESC_XML_METADATA,
  SWAGGER_DESC_SECRETS,
  SWAGGER_DESC_NESTED_JSON,
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

  constructor(private readonly appService: AppService) { }

  @Post('render')
  @ApiProduces('text/plain')
  @ApiConsumes('text/plain')
  @ApiOperation({
    description: API_DESC_RENDER_REQUEST,
  })
  @ApiBody({ description: 'Write your text here' })
  @ApiCreatedResponse({
    description: 'Rendered result',
  })
  async renderTemplate(@Body() raw): Promise<string> {
    if (typeof raw === 'string' || Buffer.isBuffer(raw)) {
      const text = raw.toString().trim();
      const res = dotT.compile(text)();
      this.logger.debug(`Rendered template: ${res}`);
      return res;
    }
  }

  @Get('goto')
  @ApiQuery({ name: 'url', example: 'https://google.com', required: true })
  @ApiOperation({
    description: API_DESC_REDIRECT_REQUEST,
  })
  @ApiOkResponse({
    description: 'Redirected',
  })
  @Redirect()
  async redirect(@Query('url') url: string) {
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
        value: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 915 585"><g stroke-width="3.45" fill="none"><path stroke="#000" d="M11.8 11.8h411v411l-411 .01v-411z"/><path stroke="#448" d="M489 11.7h415v411H489v-411z"/></g></svg>`,
      },
    },
  })
  @ApiOperation({
    description: API_DESC_XML_METADATA,
  })
  @ApiInternalServerErrorResponse({
    description: 'Invalid data',
  })
  @ApiCreatedResponse({
    description: 'XML passed successfully',
  })
  @Header('content-type', 'text/xml')
  async xml(@Body() xml: string): Promise<string> {
    const xmlDoc = parseXml(decodeURIComponent(xml), {
      dtdload: true,
      noent: true,
      doctype: true,
      dtdvalid: true,
      errors: true,
      recover: true,
    });
    this.logger.debug(xmlDoc);
    this.logger.debug(xmlDoc.getDtd());

    return xmlDoc.toString(true);
  }

  @Options()
  @ApiOperation({
    description: API_DESC_OPTIONS_REQUEST,
  })
  @Header('allow', 'OPTIONS, GET, HEAD, POST')
  async getTestOptions(): Promise<void> {
    this.logger.debug('Test OPTIONS');
  }

  @Get('spawn')
  @ApiQuery({ name: 'command', example: 'ls -la', required: true })
  @ApiOperation({
    description: API_DESC_LAUNCH_COMMAND,
  })
  @ApiOkResponse({
    type: String,
  })
  @ApiInternalServerErrorResponse({
    schema: {
      type: 'object',
      properties: { location: { type: 'string' } },
    },
  })
  async getCommandResult(@Query('command') command: string): Promise<string> {
    this.logger.debug(`launch ${command} command`);
    try {
      return await this.appService.launchCommand(command);
    } catch (err) {
      throw new InternalServerErrorException({
        error: err.message || err,
        location: __filename,
      });
    }
  }

  @Get('/config')
  @ApiOperation({
    description: API_DESC_CONFIG_SERVER,
  })
  @ApiOkResponse({
    type: AppConfig,
    status: 200,
  })
  getConfig(): AppConfig {
    this.logger.debug('Called getConfig');
    const config = this.appService.getConfig();
    return config;
  }

  @Get('/secrets')
  @ApiOperation({
    description: SWAGGER_DESC_SECRETS,
  })
  @ApiOkResponse({
    type: Object,
    status: 200,
  })
  getSecrets(): Object {
    const secrets = {
      codeclimate:
        'CODECLIMATE_REPO_TOKEN=62864c476ade6ab9d10d0ce0901ae2c211924852a28c5f960ae5165c1fdfec73',
      facebook:
        'EAACEdEose0cBAHyDF5HI5o2auPWv3lPP3zNYuWWpjMrSaIhtSvX73lsLOcas5k8GhC5HgOXnbF3rXRTczOpsbNb54CQL8LcQEMhZAWAJzI0AzmL23hZByFAia5avB6Q4Xv4u2QVoAdH0mcJhYTFRpyJKIAyDKUEBzz0GgZDZD',
      google_b64: 'QUl6YhT6QXlEQnbTr2dSdEI1W7yL2mFCX3c4PPP5NlpkWE65NkZV',
      google_oauth:
        '188968487735-c7hh7k87juef6vv84697sinju2bet7gn.apps.googleusercontent.com',
      google_oauth_token:
        'ya29.a0TgU6SMDItdQQ9J7j3FVgJuByTTevl0FThTEkBs4pA4-9tFREyf2cfcL-_JU6Trg1O0NWwQKie4uGTrs35kmKlxohWgcAl8cg9DTxRx-UXFS-S1VYPLVtQLGYyNTfGp054Ad3ej73-FIHz3RZY43lcKSorbZEY4BI',
      heroku:
        'herokudev.staging.endosome.975138 pid=48751 request_id=0e9a8698-a4d2-4925-a1a5-113234af5f60',
      hockey_app: 'HockeySDK: 203d3af93f4a218bfb528de08ae5d30ff65e1cf',
      outlook:
        'https://outlook.office.com/webhook/7dd49fc6-1975-443d-806c-08ebe8f81146@a532313f-11ec-43a2-9a7a-d2e27f4f3478/IncomingWebhook/8436f62b50ab41b3b93ba1c0a50a0b88/eff4cd58-1bb8-4899-94de-795f656b4a18',
      paypal:
        'access_token$production$x0lb4r69dvmmnufd$3ea7cb281754b7da7dac131ef5783321',
      slack:
        'xoxo-175588824543-175748345725-176608801663-826315f84e553d482bb7e73e8322sdf3',
    };
    return secrets;
  }

  @Get('/v1/userinfo/:email')
  @ApiQuery({ name: 'email', example: 'john.doe@example.com', required: true })
  @UseInterceptors(ClassSerializerInterceptor)
  @SerializeOptions({ groups: [BASIC_USER_INFO] })
  @ApiOperation({
    description: SWAGGER_DESC_FIND_USER,
  })
  @ApiOkResponse({
    type: UserDto,
    description: 'Returns basic user info if it exists',
  })
  @ApiNotFoundResponse({
    description: 'User not found',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number' },
        message: { type: 'string' },
      },
    },
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
    description: SWAGGER_DESC_FIND_USER,
  })
  @ApiOkResponse({
    type: UserDto,
    description: 'Returns basic user info if it exists',
  })
  @ApiNotFoundResponse({
    description: 'User not found',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number' },
        message: { type: 'string' },
      },
    },
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
    description: SWAGGER_DESC_NESTED_JSON,
  })
  @Header('content-type', 'application/json')
  async getNestedJson(@Query('depth', new DefaultValuePipe(1), new ParseIntPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) depth: number): Promise<string> {
    if (depth < 1) {
      throw new HttpException("JSON nesting depth is invalid", HttpStatus.BAD_REQUEST);
    }

    this.logger.debug(`Creating a JSON with a nesting depth of ${depth}`);

    var tmpObj: object = {};
    var jsonObj: object = { "0": "Leaf" };
    for (let i = 1; i < depth; i++) {
      tmpObj = {};
      tmpObj[i.toString()] = Object.assign({}, jsonObj);
      jsonObj = Object.assign({}, tmpObj);
    }

    return JSON.stringify(jsonObj);
  }
}
