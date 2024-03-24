import { MiddlewareConsumer, Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { FileModule } from './file/file.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { TestimonialsModule } from './testimonials/testimonials.module';
import { ProductsModule } from './products/products.module';
import { OrmModule } from './orm/orm.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpClientService } from './httpclient/httpclient.service';
import { HttpClientModule as HttpClientModule } from './httpclient/httpclient.module';
import { TraceMiddleware } from './components/trace.middleware';
import { GraphQLModule } from '@nestjs/graphql';
import { MercuriusDriver, MercuriusDriverConfig } from '@nestjs/mercurius';
import { AppService } from './app.service';
import { UsersService } from './users/users.service';
import { AppResolver } from './app.resolver';
import { PartnersModule } from './partners/partners.module';
import { EmailModule } from './email/email.module';

@Module({
  imports: [
    OrmModule,
    AuthModule,
    UsersModule,
    FileModule,
    SubscriptionsModule,
    TestimonialsModule,
    PartnersModule,
    ProductsModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    HttpClientModule,
    GraphQLModule.forRoot<MercuriusDriverConfig>({
      driver: MercuriusDriver,
      graphiql: true,
      autoSchemaFile: true,
    }),
    PartnersModule,
    EmailModule,
  ],
  controllers: [AppController],
  providers: [
    HttpClientService,
    AppService,
    UsersService,
    ConfigService,
    AppResolver,
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TraceMiddleware).forRoutes('(.*)');
  }
}
