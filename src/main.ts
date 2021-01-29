import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HeadersConfiguratorInterceptor } from './components/headers.configurator.interceptor';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { fastifyCookie } from 'fastify-cookie';
import session from 'fastify-session';
import { GlobalExceptionFilter } from './components/global-exception.filter';
import * as os from 'os';
import * as cluster from 'cluster';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import fmp from 'fastify-multipart';
import { randomBytes } from 'crypto';
import * as http from 'http';
import * as https from 'https';

async function bootstrap() {
  http.globalAgent.maxSockets = Infinity;
  https.globalAgent.maxSockets = Infinity;

  const app: NestFastifyApplication = await NestFactory.create(
    AppModule,
    new FastifyAdapter(),
  );

  await app.register(fastifyCookie);
  await app.register(fmp);
  await app.register(session, {
    secret: randomBytes(32).toString('hex').slice(0, 32),
    cookieName: 'connect.sid',
    cookie: {
      secure: false,
      httpOnly: false,
    },
  });

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

  await app.listen(3000);
}

const CPUS = os.cpus().length;

if (cluster.isMaster && process.env.NODE_ENV === 'production') {
  for (let i = 0; i < CPUS; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker) => {
    console.log(`worker ${worker.process.pid} died`);
  });
} else {
  bootstrap();
}
