import { Testimonial } from '../model/testimonial.entity';
import { OrmConfigFactory } from './orm.config.factory';
import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    MikroOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) =>
        new OrmConfigFactory(configService).buildConfig(),
    }),
    MikroOrmModule.forFeature({
      entities: [Testimonial],
    }),
  ],
  exports: [MikroOrmModule],
})
export class OrmModule {}
