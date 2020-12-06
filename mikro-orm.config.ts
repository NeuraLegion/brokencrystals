import { Logger } from '@nestjs/common';
import { Options, ReflectMetadataProvider } from '@mikro-orm/core';
import { SqlHighlighter } from '@mikro-orm/sql-highlighter';

const logger = new Logger('MikroORM');

const config = {
  entities: ['dist/model'],
  entitiesTs: ['src/model'],
  dbName: 'gil',
  type: 'postgresql',
  port: 5432,
  metadataProvider: ReflectMetadataProvider,
  highlighter: new SqlHighlighter(),
  debug: true,
  logger: logger.log.bind(logger)
} as Options;

export default config;
