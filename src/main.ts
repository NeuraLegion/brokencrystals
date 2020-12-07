import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HeadersConfiguratorInterceptor } from './interceptors/headers.configurator.interceptor';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as session from 'express-session';
import { Request, Response } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalInterceptors(new HeadersConfiguratorInterceptor());
  app.enableCors({
    origin: '*',
    preflightContinue: true,
  });

  const options = new DocumentBuilder()
    .setTitle('Broken Crystal')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('swagger', app, document);

  app.use(function (req: Request, res: Response, next) {
    if (req.method === 'TRACE') {
      if (req.header('Trace-Supported')) {
        res.header('Trace-Supported', req.header('Trace-Supported'));
      }
      res.end();
    } else {
      next();
    }
  });

  app.use(
    session({
      secret: 'secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false,
        httpOnly: false,
      },
    }),
  );

  await app.listen(3000);
}
bootstrap();
