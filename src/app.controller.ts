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
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { spawn } from 'child_process';
import * as dotT from 'dot';
import { parseXml } from 'libxmljs';
import { AppConfig } from './app.config.api';
import { AppModuleConfigProperties } from './app.module.config.properties';
import { OrmModuleConfigProperties } from './orm/orm.module.config.properties';

@Controller('/api')
@ApiTags('app controller')
export class AppController {
  private static readonly XML_ENTITY_INJECTION = '<!DOCTYPE replace [<!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>'.toLowerCase();
  private static readonly XML_ENTITY_INJECTION_RESPONSE = `root:x:0:0:root:/root:/bin/bash
  daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin`;

  private readonly logger = new Logger(AppController.name);

  constructor(private readonly configService: ConfigService) {}

  @ApiProduces('text/plain')
  @ApiConsumes('text/plain')
  @ApiBody({
    description:
      'Template for rendering by doT. Expects plain text as request body',
  })
  @ApiResponse({
    description: 'Rendered result',
    status: 200,
  })
  @Post('render')
  async renderTemplate(@Body() raw): Promise<string> {
    if (typeof raw === 'string' || Buffer.isBuffer(raw)) {
      const text = raw.toString().trim();
      const res = dotT.compile(text)();
      this.logger.debug(`Rendered template: ${res}`);
      return res;
    }
  }

  @ApiOperation({
    description: 'Redirects the user to the provided url',
  })
  @Get('goto')
  @Redirect()
  async redirect(@Query('url') url: string) {
    return { url };
  }

  @ApiOperation({
    description:
      "Receives client's metadata in XML format. Returns the passed XML",
  })
  @Post('metadata')
  @Header('content-type', 'text/xml')
  async xml(@Query('xml') xml: string): Promise<string> {
    if (xml === AppController.XML_ENTITY_INJECTION) {
      return AppController.XML_ENTITY_INJECTION_RESPONSE;
    }

    const xmlDoc = parseXml(xml, {
      dtdload: true,
      noent: false,
      doctype: true,
      dtdvalid: true,
      errors: true,
    });

    this.logger.debug(xmlDoc);
    this.logger.debug(xmlDoc.getDtd());

    return xmlDoc.toString(true);
  }

  @ApiOperation({
    description: 'Returns the list of supported operations',
  })
  @Options()
  @Header('allow', 'OPTIONS, GET, HEAD, POST')
  async getTestOptions(): Promise<void> {
    this.logger.debug('Test OPTIONS');
  }

  @Get('spawn')
  @ApiOperation({
    description: 'Launches system command on server',
  })
  @ApiResponse({
    type: String,
    status: 200,
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

  @ApiOperation({
    description: 'Returns server configuration to the client',
  })
  @ApiResponse({
    type: AppConfig,
    status: 200,
  })
  @Get('/config')
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
      mailgun: this.configService.get<string>(
        AppModuleConfigProperties.ENV_MAILGUN_API,
      ),
    };
  }
}
