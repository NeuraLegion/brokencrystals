import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HeadersConfiguratorInterceptor } from './components/headers.configurator.interceptor';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import fastifyCookie from '@fastify/cookie';
import fastifyHttpProxy from '@fastify/http-proxy';
import session from '@fastify/session';
import { GlobalExceptionFilter } from './components/global-exception.filter';
import * as os from 'os';
import { readFileSync, readFile, readdirSync } from 'fs';
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
import rawbody from 'raw-body';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';

const renderDirList: ListRender = (dirs, files) => {
  const currDir = dirname((dirs[0] || files[0]).href);
  const parentDir = dirname(currDir);
  return `
    <head><title>Index of ${currDir}/</title></head>
    <html><body>
      <h1>Index of ${currDir}/</h1>
      <hr>
      <table style="width: max(450px, 50%);">
        <tr>
          <td>
            <a href="${parentDir}">../</a>
          </td>
          <td></td><td></td>
        </tr>
        ${dirs.map(
          (dir) =>
            `<tr>
              <td>
                <a href="${dir.href}">${dir.name}</a>
              </td>
              <td>
                ${dir.stats.ctime.toLocaleString()}
              </td>
              <td>
                -
              </td>
            </tr>`
        )}
        <br/>
        ${files.map(
          (file) =>
            `<tr>
              <td>
                <a href="${file.href}">${file.name}</a>
              </td>
              <td>
                ${file.stats.ctime.toLocaleString()}
              </td>
              <td>
                ${file.stats.size}
              </td>
            </tr>`
        )}
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

  // Filenames that should never be served, even though they are not
  // dot-files (defense in depth in case they ever end up in the client
  // build output again).
  const BLOCKED_STATIC_FILENAMES = new Set([
    'config.js',
    'config.json',
    'nginx.conf'
  ]);

  // The `/client/vcs/*` directories (git/svn/hg) are intentionally exposed
  // under dot-prefixed routes (e.g. `/.git`) as part of this benchmark's
  // "exposed VCS metadata" vulnerability scenario, so those specific
  // prefixes must remain reachable. Every other dot-file/dot-directory
  // (e.g. `.htaccess`, `.env`, `.git` outside of the dedicated route) must
  // never be served.
  const ALLOWED_DOT_PREFIXES = readdirSync(
    join(__dirname, '..', 'client', 'vcs')
  ).map((dir) => `/.${dir}`);

  server.addHook('onRequest', (req, reply, done) => {
    const url = req.url || '';
    const path = url.split('?')[0];
    const filename = path.substring(path.lastIndexOf('/') + 1);
    const isDotFile = path
      .split('/')
      .some((segment) => segment.length > 0 && segment.startsWith('.'));
    const isAllowedVcsRoute = ALLOWED_DOT_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`)
    );
    if (
      (isDotFile && !isAllowedVcsRoute) ||
      BLOCKED_STATIC_FILENAMES.has(filename)
    ) {
      reply.code(404).send({
        success: false,
        error: {
          kind: 'user_input',
          message: 'Not Found'
        }
      });
      return;
    }
    done();
  });

  await server.register(fastifyStatic, {
    root: join(__dirname, '..', 'client', 'dist'),
    prefix: `/`,
    decorateReply: false,
    redirect: false,
    wildcard: false,
    dotfiles: 'deny'
  });

  for (const dir of readdirSync(join(__dirname, '..', 'client', 'vcs'))) {
    await server.register(fastifyStatic, {
      root: join(__dirname, '..', 'client', 'vcs', dir),
      prefix: `/.${dir}`,
      decorateReply: false,
      redirect: true,
      index: false,
      list: {
        format: 'html',
        render: renderDirList
      },
      dotfiles: 'allow'
    });
  }

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
    dotfiles: 'deny'
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
