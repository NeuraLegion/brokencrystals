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
import fastify, { FastifyRequest, FastifyReply } from 'fastify';
import { fastifyStatic, ListRender } from '@fastify/static';
import { join, dirname, basename, posix } from 'path';
import rawbody from 'raw-body';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escapeHtmlAttribute = (value: string) =>
  escapeHtml(value).replace(/`/g, '&#96;');

const sanitizeHref = (value: string) => {
  const normalized = posix.normalize(value).replace(/\\/g, '/');
  if (!normalized.startsWith('/')) {
    return `/${normalized}`;
  }
  return normalized;
};

const renderDirList: ListRender = (dirs, files) => {
  const currDir = dirname((dirs[0] || files[0]).href);
  const parentDir = dirname(currDir);
  const safeCurrDir = escapeHtml(currDir);
  const safeParentDir = escapeHtmlAttribute(sanitizeHref(parentDir));

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
          .map((dir) => {
            const safeHref = escapeHtmlAttribute(sanitizeHref(dir.href));
            const safeName = escapeHtml(dir.name);
            const safeCtime = escapeHtml(dir.stats.ctime.toLocaleString());
            return `<tr>
              <td>
                <a href="${safeHref}">${safeName}</a>
              </td>
              <td>
                ${safeCtime}
              </td>
              <td>
                -
              </td>
            </tr>`;
          })
          .join('')}
        <br/>
        ${files
          .map((file) => {
            const safeHref = escapeHtmlAttribute(sanitizeHref(file.href));
            const safeName = escapeHtml(file.name);
            const safeCtime = escapeHtml(file.stats.ctime.toLocaleString());
            const safeSize = escapeHtml(String(file.stats.size));
            return `<tr>
              <td>
                <a href="${safeHref}">${safeName}</a>
              </td>
              <td>
                ${safeCtime}
              </td>
              <td>
                ${safeSize}
              </td>
            </tr>`;
          })
          .join('')}
      </table>
      <hr>
    </body></html>
  `;
};

const forbiddenFileNames = new Set([
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  '.env.test',
  '.env.development.local',
  '.env.production.local',
  '.env.test.local',
  '.git',
  '.gitignore',
  '.gitmodules',
  '.htaccess',
  'nginx.conf',
  'config.js',
  'secrets',
  'secret',
  'credentials',
  'credential',
  'token',
  'tokens'
]);

const forbiddenPathPatterns = [
  /(^|\/)(?:\.env(?:\..*)?|config\.js|secrets?(?:\..*)?|credentials?(?:\..*)?|token(?:s)?(?:\..*)?)$/i,
  /(^|\/)(?:[^/]*\.)?(?:env|ini|cfg|conf)$/i
];

const decodePathname = (value: string) => {
  let current = value;
  for (let i = 0; i < 3; i++) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) {
        break;
      }
      current = decoded;
    } catch {
      break;
    }
  }
  return current;
};

const isForbiddenRequestPath = (requestUrl: string) => {
  const rawPath = requestUrl.split('?')[0].split('#')[0] || '/';
  const decodedPath = decodePathname(rawPath).replace(/\\/g, '/');
  const normalized = posix.normalize(decodedPath);
  const segments = normalized.split('/').filter(Boolean);

  if (segments.length === 0) {
    return false;
  }

  if (
    normalized === '/api/secrets' ||
    normalized.startsWith('/api/secrets/') ||
    normalized.includes('/api/secrets?')
  ) {
    return true;
  }

  if (segments.some((segment) => segment.startsWith('.'))) {
    return true;
  }

  if (segments.some((segment) => forbiddenFileNames.has(segment.toLowerCase()))) {
    return true;
  }

  return forbiddenPathPatterns.some((pattern) => pattern.test(normalized));
};

const denyForbiddenResponse = (reply: FastifyReply) => {
  reply.code(404);
  reply.header('cache-control', 'no-store, max-age=0');
  reply.header('content-type', 'application/json; charset=utf-8');
  return reply.send({
    success: false,
    error: {
      kind: 'user_input',
      message: 'Not Found'
    }
  });
};

const denyForbiddenRawResponse = (res: {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (data?: string) => void;
}) => {
  res.statusCode = 404;
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(
    JSON.stringify({
      success: false,
      error: {
        kind: 'user_input',
        message: 'Not Found'
      }
    })
  );
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

  // Block sensitive paths before routing, static file serving, proxying, or
  // any plugin can resolve them. This also prevents static fallthrough from
  // exposing /api/secrets or source-controlled config files.
  server.server.prependListener('request', (req, res) => {
    if (req.url && isForbiddenRequestPath(req.url)) {
      denyForbiddenRawResponse(res);
    }
  });

  server.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.raw?.url && isForbiddenRequestPath(req.raw.url)) {
      return denyForbiddenResponse(reply);
    }
  });

  server.addHook('preParsing', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.raw?.url && isForbiddenRequestPath(req.raw.url)) {
      return denyForbiddenResponse(reply);
    }
  });

  server.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.raw?.url && isForbiddenRequestPath(req.raw.url)) {
      return denyForbiddenResponse(reply);
    }
  });

  server.setDefaultRoute((req, res) => {
    if (req.url && isForbiddenRequestPath(req.url)) {
      res.statusCode = 404;
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
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

    if (req.url && req.url.startsWith('/api')) {
      res.statusCode = 404;
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
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
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.end(data);
      }
    );
  });

  const staticSecurityHeaders = (
    res: { statusCode: number; setHeader: (name: string, value: string) => void },
    filePath: string
  ) => {
    const fileName = basename(filePath).toLowerCase();
    const pathValue = filePath.toLowerCase();
    if (
      fileName.startsWith('.') ||
      forbiddenFileNames.has(fileName) ||
      fileName.startsWith('.env.') ||
      pathValue.includes('/.') ||
      pathValue.includes('\\.') ||
      forbiddenPathPatterns.some((pattern) => pattern.test(pathValue))
    ) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, max-age=0');
    }
  };

  await server.register(fastifyStatic, {
    root: join(__dirname, '..', 'client', 'dist'),
    prefix: `/`,
    decorateReply: false,
    redirect: false,
    wildcard: false,
    index: false,
    serveDotFiles: false,
    maxAge: '0',
    etag: false,
    setHeaders(res, filePath) {
      staticSecurityHeaders(res, filePath);
    }
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
      serveDotFiles: false,
      setHeaders(res, filePath) {
        staticSecurityHeaders(res, filePath);
      }
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
    serveDotFiles: false,
    setHeaders(res, filePath) {
      staticSecurityHeaders(res, filePath);
    }
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
