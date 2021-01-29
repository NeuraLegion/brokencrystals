import { OrmModuleConfigProperties } from './orm.module.config.properties';
import { Logger } from '@nestjs/common';
import { Options, ReflectMetadataProvider } from '@mikro-orm/core';
import { SqlHighlighter } from '@mikro-orm/sql-highlighter';
import { ConfigService } from '@nestjs/config';

const logger = new Logger('MikroORM');

export class OrmConfigFactory {
  private readonly configService: ConfigService;

  constructor(configService: ConfigService) {
    this.configService = configService;
  }

  public buildConfig(): Options {
    const config = {
      entities: ['dist/model'],
      entitiesTs: ['src/model'],
      host: this.configService.get<string>(
        OrmModuleConfigProperties.ENV_DATABASE_HOST,
      ),
      dbName: this.configService.get<string>(
        OrmModuleConfigProperties.ENV_DATABASE_SCHEMA,
      ),
      user: this.configService.get<string>(
        OrmModuleConfigProperties.ENV_DATABASE_USER,
      ),
      password: this.configService.get<string>(
        OrmModuleConfigProperties.ENV_DATABASE_PASSWORD,
      ),
      type: 'postgresql',
      port: this.configService.get<number>(
        OrmModuleConfigProperties.ENV_DATABASE_PORT,
      ),
      metadataProvider: ReflectMetadataProvider,
      highlighter: new SqlHighlighter(),
      debug:
        this.configService.get<string>(
          OrmModuleConfigProperties.ENV_DATABASE_PORT,
        ) === 'true',
      logger: logger.log.bind(logger),
    } as Options;

    return config;
  }
}
