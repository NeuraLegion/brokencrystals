import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HeadersConfiguratorInterceptor } from './components/headers.configurator.interceptor';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import fastifyCookie from '@fastify/cookie';
import session from '@fastify/session';
import { GlobalExceptionFilter } from './components/global-exception.filter';
import * as os from 'os';
import { readFileSync, readFile, readdirSync } from 'fs';
import * as cluster from 'cluster';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import fmp from '@fastify/multipart';
import { randomBytes } from 'crypto';
import * as http from 'http';
import * as https from 'https';
import fastify from 'fastify';
import { fastifyStatic, ListRender } from '@fastify/static';
import { join, dirname } from 'path';
import * as rawbody from 'raw-body';

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
            </tr>`,
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
            </tr>`,
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
    trustProxy: true,
    onProtoPoisoning: 'ignore',
    https:
      process.env.NODE_ENV === 'production'
        ? {
            cert: readFileSync(
              '/etc/letsencrypt/live/brokencrystals.com/fullchain.pem',
            ),
            key: readFileSync(
              '/etc/letsencrypt/live/brokencrystals.com/privkey.pem',
            ),
          }
        : null,
  });

  server.setDefaultRoute((req, res) => {
    if (req.url && req.url.startsWith('/api')) {
      res.statusCode = 404;
      return res.end({
        success: false,
        error: {
          kind: 'user_input',
          message: 'Not Found',
        },
      });
    }

    readFile(
      join(__dirname, '..', 'client', 'build', 'index.html'),
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
      },
    );
  });

  await server.register(fastifyStatic, {
    root: join(__dirname, '..', 'client', 'build'),
    prefix: `/`,
    decorateReply: false,
    redirect: false,
    wildcard: false,
    serveDotFiles: true,
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
        render: renderDirList,
      },
      serveDotFiles: true,
    });
  }

  await server.register(fastifyStatic, {
    root: join(__dirname, '..', 'client', 'build', 'vendor'),
    prefix: `/vendor`,
    decorateReply: false,
    redirect: true,
    index: false,
    list: {
      format: 'html',
      render: renderDirList,
    },
    serveDotFiles: true,
  });

  const app: NestFastifyApplication = await NestFactory.create(
    AppModule,
    new FastifyAdapter(server),
    {
      logger: process.env.NODE_ENV === 'production' ? ['error'] : ['debug'],
    },
  );

  await server.register(fastifyCookie);
  await server.register(fmp);
  await server.register(session, {
    secret: randomBytes(32).toString('hex').slice(0, 32),
    cookieName: 'connect.sid',
    cookie: {
      secure: false,
      httpOnly: false,
    },
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


  `,
    )
    .setVersion('1.0')
    .addServer(process.env.URL)
    .build();
  const document = SwaggerModule.createDocument(app, options);

  SwaggerModule.setup('swagger', app, document);

  await app.listen(3000, '0.0.0.0');
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
