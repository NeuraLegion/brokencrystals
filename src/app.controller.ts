import {
  Body,
  Controller,
  Get,
  Header,
  Logger,
  Options,
  Post,
  Query,
  Redirect,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { spawn } from 'child_process';
import * as dotT from 'dot';
import { parseXml } from 'libxmljs';
import { AppConfig } from './app.config.api';
import { AppModuleConfigProperties } from './app.module.config.properties';
import { OrmModuleConfigProperties } from './orm/orm.module.config.properties';
import {
  SWAGGER_DESC_CONFIG_SERVER,
  SWAGGER_DESC_LAUNCH_COMMAND,
  SWAGGER_DESC_OPTIONS_REQUEST,
  SWAGGER_DESC_REDIRECT_REQUEST,
  SWAGGER_DESC_RENDER_REQUEST,
  SWAGGER_DESC_XML_METADATA,
} from './app.controller.swagger.desc';

@Controller('/api')
@ApiTags('App controller')
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(private readonly configService: ConfigService) {}

  @Post('render')
  @ApiProduces('text/plain')
  @ApiConsumes('text/plain')
  @ApiOperation({
    description: SWAGGER_DESC_RENDER_REQUEST,
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
  @ApiOperation({
    description: SWAGGER_DESC_REDIRECT_REQUEST,
  })
  @ApiOkResponse({
    description: 'Redirected',
  })
  @Redirect()
  async redirect(@Query('url') url: string) {
    return { url };
  }

  @Post('metadata')
  @ApiOperation({
    description: SWAGGER_DESC_XML_METADATA,
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
    description: SWAGGER_DESC_OPTIONS_REQUEST,
  })
  @Header('allow', 'OPTIONS, GET, HEAD, POST')
  async getTestOptions(): Promise<void> {
    this.logger.debug('Test OPTIONS');
  }

  @Get('spawn')
  @ApiOperation({
    description: SWAGGER_DESC_LAUNCH_COMMAND,
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
  async launchCommand(@Query('command') command: string): Promise<string> {
    this.logger.debug(`launch ${command} command`);

    return new Promise((res, rej) => {
      try {
        const [exec, ...args] = command.split(' ');
        const ps = spawn(exec, args);

        ps.stdout.on('data', (data: Buffer) => {
          this.logger.debug(`stdout: ${data}`);
          res(data.toString('ascii'));
        });

        ps.stderr.on('data', (data: Buffer) => {
          this.logger.debug(`stderr: ${data}`);
          res(data.toString('ascii'));
        });

        ps.on('error', (err) => rej(err.message));

        ps.on('close', (code) =>
          this.logger.debug(`child process exited with code ${code}`),
        );
      } catch (err) {
        rej(err.message);
      }
    });
  }

  @Get('/config')
  @ApiOperation({
    description: SWAGGER_DESC_CONFIG_SERVER,
  })
  @ApiOkResponse({
    type: AppConfig,
    status: 200,
  })
  getConfig(): AppConfig {
    this.logger.debug('Called getConfig');
    const dbSchema = this.configService.get<string>(
      OrmModuleConfigProperties.ENV_DATABASE_SCHEMA,
    );
    const dbHost = this.configService.get<string>(
      OrmModuleConfigProperties.ENV_DATABASE_HOST,
    );
    const dbPort = this.configService.get<string>(
      OrmModuleConfigProperties.ENV_DATABASE_PORT,
    );
    const dbUser = this.configService.get<string>(
      OrmModuleConfigProperties.ENV_DATABASE_USER,
    );
    const dbPwd = this.configService.get<string>(
      OrmModuleConfigProperties.ENV_DATABASE_PASSWORD,
    );
    return {
      awsBucket: this.configService.get<string>(
        AppModuleConfigProperties.ENV_AWS_BUCKET,
      ),
      sql: `postgres://${dbUser}:${dbPwd}@${dbHost}:${dbPort}/${dbSchema} `,
      googlemaps: this.configService.get<string>(
        AppModuleConfigProperties.ENV_GOOGLE_MAPS,
      ),
    };
  }
}
