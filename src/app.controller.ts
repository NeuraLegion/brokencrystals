import { Controller, Get, Header, Logger, Options } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from './app.config.api';
import { AppService } from './app.service';
import { AppModuleConfigProperties } from './app.module.config.properties';
import { OrmModuleConfigProperties } from './orm/orm.module.config.properties';

@Controller('/api')
export class AppController {
  private log: Logger = new Logger(AppController.name);

  constructor(
    private readonly appService: AppService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  getHello(): string {
    return __filename; //this.appService.getHello();
  }

  @Options()
  @Header('Allow', 'OPTIONS, GET, HEAD, POST')
  getTestOptions(): void {
    this.log.debug('Called getTestOptions');
  }

  @Get('/config')
  getConfig(): AppConfig {
    this.log.debug('Called getConfig');
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
