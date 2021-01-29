import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { FileModule } from './file/file.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { TestimonialsModule } from './testimonials/testimonials.module';
import { OrmModule } from './orm/orm.module';
import { ConfigModule } from '@nestjs/config';
import { HttpClientService } from './httpclient/httpclient.service';
import { HttpClientModule as HttpClientModule } from './httpclient/httpclient.module';

@Module({
  imports: [
    OrmModule,
    AuthModule,
    UsersModule,
    FileModule,
    SubscriptionsModule,
    TestimonialsModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    HttpClientModule,
  ],
  controllers: [AppController],
  providers: [HttpClientService],
})
export class AppModule {}
