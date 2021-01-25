import { Testimonial } from '../model/testimonial.entity';
import { OrmConfigFactory } from './orm.config.factory';
import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { ConfigService } from '@nestjs/config';
import { User } from '../model/user.entity';

@Module({
  imports: [
    MikroOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) =>
        new OrmConfigFactory(configService).buildConfig(),
    }),
    MikroOrmModule.forFeature({
      entities: [Testimonial, User],
    }),
  ],
  exports: [MikroOrmModule],
})
export class OrmModule {}
