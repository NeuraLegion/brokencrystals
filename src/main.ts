import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HeadersConfiguratorInterceptor } from './components/headers.configurator.interceptor';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as session from 'express-session';
import { NextFunction, Request, Response } from 'express';
import { GlobalExceptionFilter } from './components/global-exception.filter';
import * as os from 'os';
import * as cluster from 'cluster';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const httpAdapter = app.getHttpAdapter();

  app
    .useGlobalInterceptors(new HeadersConfiguratorInterceptor())
    .useGlobalFilters(new GlobalExceptionFilter(httpAdapter));

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

  app.use((req: Request, res: Response, next: NextFunction) => {
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

const CPUS = os.cpus().length;

if (cluster.isMaster && process.env.NODE_ENV === 'production') {
  console.log(`MASTER SERVER (${process.pid}) IS RUNNING `);

  for (let i = 0; i < CPUS; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker) => {
    console.log(`worker ${worker.process.pid} died`);
  });
} else {
  bootstrap();
}
