import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HeadersConfiguratorInterceptor } from './components/headers.configurator.interceptor';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import fastifyCookie from '@fastify/cookie';
import fastifyHttpProxy from '@fastify/http-proxy';
import session from '@fastify/session';
import { GlobalExceptionFilter } from './components/global-exception.filter';
import * as os from 'os';
import { readFileSync, readFile } from 'fs';
import cluster from 'cluster';
import {
  FastifyAdapter,
  NestFastifyApplication
} from '@nestjs/platform-fastify';
import fmp from '@fastify/multipart';
import { randomBytes } from 'crypto';
import * as http from 'http';
import * as https from 'https';
import fastify from 'fastify';
import { fastifyStatic, ListRender } from '@fastify/static';
import { join, dirname } from 'path';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
import rawbody from 'raw-body';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';

const renderDirList: ListRender = (dirs, files) => {
  const currentEntry = dirs[0] || files[0];
  const currDir = currentEntry ? dirname(currentEntry.href) : '/';
  const parentDir = dirname(currDir);
  const safeCurrDir = escapeHtml(currDir);
  const safeParentDir = escapeHtml(parentDir);
  return `
    <head><title>Index of ${safeCurrDir}/</title></head>
    <html><body>
      <h1>Index of ${safeCurrDir}/</h1>
      <hr>
      <table style="width: max(450px, 50%);">
        <tr>
          <td>
            <a href="${safeParentDir}">../</a>
          </td>
          <td></td><td></td>
        </tr>
        ${dirs
          .map(
            (dir) =>
              `<tr>
                <td>
                  <a href="${escapeHtml(dir.href)}">${escapeHtml(dir.name)}</a>
                </td>
                <td>
                  ${escapeHtml(dir.stats.ctime.toLocaleString())}
                </td>
                <td>
                  -
                </td>
              </tr>`
          )
          .join('')}
        <br/>
        ${files
          .map(
            (file) =>
              `<tr>
                <td>
                  <a href="${escapeHtml(file.href)}">${escapeHtml(file.name)}</a>
                </td>
                <td>
                  ${escapeHtml(file.stats.ctime.toLocaleString())}
                </td>
                <td>
                  ${file.stats.size}
                </td>
              </tr>`
          )
          .join('')}
      </table>
      <hr>
    </body></html>
  `;
};

async function bootstrap() {
  http.globalAgent.maxSockets = Infinity;
  https.globalAgent.maxSockets = Infinity;

  const server = fastify({
    logger:
      process.env.FASTIFY_LOGGER === 'true'
        ? { level: process.env.FASTIFY_LOG_LEVEL || 'warn' }
        : false,
    trustProxy: true,
    onProtoPoisoning: 'ignore',
    https:
      process.env.NODE_ENV === 'production'
        ? {
            cert: readFileSync(
              '/etc/letsencrypt/live/brokencrystals.com/fullchain.pem'
            ),
            key: readFileSync(
              '/etc/letsencrypt/live/brokencrystals.com/privkey.pem'
            )
          }
        : null
  });

  server.setErrorHandler((error, _req, reply) => {
    if (error.statusCode && error.statusCode < 500) {
      return reply.status(error.statusCode).send({
        error: error.statusCode === 404 ? 'Not found' : 'Request failed'
      });
    }

    return reply.status(500).send({
      error: 'Internal server error'
    });
  });

  server.addHook('onRequest', (req, res, done) => {
    if (
      req.raw.url?.startsWith('/.git') ||
      req.raw.url?.startsWith('/.svn') ||
      req.raw.url?.startsWith('/.hg')
    ) {
      res.statusCode = 404;
      return res.end('Not Found');
    }
    done();
  });

  server.setDefaultRoute((req, res) => {
    if (req.url && req.url.startsWith('/api')) {
      res.statusCode = 404;
      return res.end(
        JSON.stringify({
          success: false,
          error: {
            kind: 'user_input',
            message: 'Not Found'
          }
        })
      );
    }

    readFile(
      join(__dirname, '..', 'client', 'dist', 'index.html'),
      'utf8',
      (err, data) => {
        if (err) {
          res.statusCode = 500;
          res.end('Internal Server Error');
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html');
        res.end(data);
      }
    );
  });

  await server.register(fastifyStatic, {
    root: join(__dirname, '..', 'client', 'dist'),
    prefix: `/`,
    decorateReply: false,
    redirect: false,
    wildcard: false,
    serveDotFiles: false,
    setHeaders(res, path) {
      if (path.endsWith('/config.js')) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Not Found');
      }
    }
  });

  server.addHook('onRequest', (req, res, done) => {
    const pathname = req.raw.url?.split('?')[0] || '';
    if (
      pathname.startsWith('/.git') ||
      pathname.startsWith('/.svn') ||
      pathname.startsWith('/.hg')
    ) {
      res.statusCode = 404;
      return res.end('Not Found');
    }
    done();
  });

  server.route({
    method: 'GET',
    url: '/.env',
    handler: async (_req, res) => {
      res.statusCode = 404;
      return res.send({
        success: false,
        error: {
          kind: 'user_input',
          message: 'Not Found'
        }
      });
    }
  });

  server.setNotFoundHandler((req, res) => {
    if (
      req.raw.url?.startsWith('/.git') ||
      req.raw.url?.startsWith('/.svn') ||
      req.raw.url?.startsWith('/.hg')
    ) {
      res.statusCode = 404;
      return res.end('Not Found');
    }
    res.callNotFound();
  });

  await server.register(fastifyStatic, {
    root: join(__dirname, '..', 'client', 'dist', 'vendor'),
    prefix: `/vendor`,
    decorateReply: false,
    redirect: true,
    index: false,
    list: {
      format: 'html',
      render: renderDirList
    },
    serveDotFiles: false
  });

  await server.register(fastifyHttpProxy, {
    prefix: '/grpc',
    upstream: process.env.GRPC_WEB_PROXY_URL,
    replyOptions: {
      rewriteRequestHeaders: (req, headers) => ({
        ...headers,
        host: undefined
      })
    }
  });

  const app: NestFastifyApplication = await NestFactory.create(
    AppModule,
    new FastifyAdapter(server),
    {
      logger:
        process.env.NODE_ENV === 'production'
          ? ['error']
          : ['debug', 'log', 'warn', 'error']
    }
  );

  await server.register(fastifyCookie);
  await server.register(fmp);
  await server.register(session, {
    secret: randomBytes(32).toString('hex').slice(0, 32),
    cookieName: 'connect.sid',
    cookie: {
      secure: false,
      httpOnly: false
    }
  });
  server.addContentTypeParser('*', (req) => rawbody(req.raw));

  const httpAdapter = app.getHttpAdapter();

  app
    .useGlobalInterceptors(new HeadersConfiguratorInterceptor())
    .useGlobalFilters(new GlobalExceptionFilter(httpAdapter));

  const options = new DocumentBuilder()
    .setTitle('Broken Crystals')
    .setDescription(
      `
  ![BC logo](/assets/img/logo_blue_small.png)

  This is the _Broken Crystals_ REST API.

  _Broken Crystals_ is a benchmark application that uses modern technologies and implements a set of common security vulnerabilities.

  ## Available endpoints

  * [App](#/App%20controller) - common operations

  * [Auth](#/Auth%20controller) - operations with authentication methods

  * [User](#/User%20controller) - operations with users(creation, searching)

  * [Files](#/Files%20controller) - operations with files

  * [Subscriptions](#/Subscriptions%20controller) - operations with subscriptions

  * [Testimonials](#/Testimonials%20controller) - operations with testimonials

  * [Products](#/Products%20controller) — operations with products

  * [Partners](#/Partners%20controller) — operations with partners

  * [Emails](#/Emails%20controller) — operations with emails
  
  * [Chat](#/Chat%20controller) — operations with chat


  `
    )
    .setVersion('1.0')
    .addServer(process.env.URL)
    .build();
  const document = SwaggerModule.createDocument(app, options);

  SwaggerModule.setup('swagger', app, document);

  const grpcDir = join(__dirname, 'grpc');
  const protoFiles = readdirSync(grpcDir).filter((file) =>
    file.endsWith('.proto')
  );
  const protoPackages = protoFiles.map((file) => file.replace('.proto', ''));
  const protoPaths = protoFiles.map((file) => join(grpcDir, file));

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: protoPackages,
      protoPath: protoPaths,
      url: '0.0.0.0:5000'
    }
  });

  await app.startAllMicroservices();
  await app.listen(3000, '0.0.0.0');
}

if (cluster.isPrimary && process.env.NODE_ENV === 'production') {
  console.log(`Primary ${process.pid} is running`);

  const numCPUs = os.cpus().length;
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(
      `Worker ${worker.process.pid} died with code ${code} and signal ${signal}`
    );
    console.log('Starting a new worker');
    cluster.fork();
  });
} else {
  bootstrap();
  console.log(`Worker ${process.pid} started`);
}
