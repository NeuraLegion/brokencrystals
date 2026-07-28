import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HeadersConfiguratorInterceptor } from './components/headers.configurator.interceptor';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import fastifyCookie from '@fastify/cookie';
import fastifyHttpProxy from '@fastify/http-proxy';
import session from '@fastify/session';
import { GlobalExceptionFilter } from './components/global-exception.filter';
import * as os from 'os';
import { readFileSync, readFile, statSync } from 'fs';
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
import { fastifyStatic } from '@fastify/static';
import { join } from 'path';
import rawbody from 'raw-body';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';

const GENERIC_HTTP_ERROR_MESSAGES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found'
};

function getGenericHttpErrorBody(statusCode: number) {
  return {
    statusCode,
    error:
      statusCode >= 500
        ? 'Internal Server Error'
        : (GENERIC_HTTP_ERROR_MESSAGES[statusCode] ?? 'Request failed')
  };
}

function sanitizeText(value: string) {
  return value
    .replace(/([A-Za-z]:\\[^\r\n\t"' )\]}]+|(?:\/[^\r\n\t"' )\]}]+)+)/g, '[redacted-path]')
    .replace(/file:\/\/[^\r\n\t"' )\]}]+/gi, '[redacted-file-uri]')
    .replace(/\b(?:[A-Za-z]:)?(?:\\|\/)(?:[^\r\n\t"' )\]}]+(?:\\|\/))*[^\r\n\t"' )\]}]*/g, '[redacted-path]');
}

function getSanitizedHttpExceptionBody(
  statusCode: number,
  response: unknown
) {
  const genericBody = getGenericHttpErrorBody(statusCode);

  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    return genericBody;
  }

  const responseBody = response as Record<string, unknown>;
  const responseError =
    typeof responseBody.error === 'string'
      ? sanitizeText(responseBody.error)
      : undefined;

  return {
    ...genericBody,
    ...(responseError && responseError === genericBody.error
      ? { error: responseError }
      : {})
  };
}

function getHttpsOptions() {
  if (process.env.NODE_ENV !== 'production') {
    return null;
  }

  const certPath = process.env.TLS_CERT_PATH || '/etc/letsencrypt/live/brokencrystals.com/fullchain.pem';
  const keyPath = process.env.TLS_KEY_PATH || '/etc/letsencrypt/live/brokencrystals.com/privkey.pem';

  try {
    return {
      cert: readFileSync(certPath),
      key: readFileSync(keyPath)
    };
  } catch {
    throw new Error('TLS configuration could not be initialized');
  }
}


async function bootstrap() {
  const sanitizeErrorForLogging = (error: unknown) => {
    const statusCode =
      typeof (error as { statusCode?: unknown })?.statusCode === 'number'
        ? ((error as { statusCode?: number }).statusCode as number)
        : undefined;
    const code =
      typeof (error as { code?: unknown })?.code === 'string'
        ? ((error as { code?: string }).code as string)
        : undefined;
    const name =
      typeof (error as { name?: unknown })?.name === 'string'
        ? ((error as { name?: string }).name as string)
        : 'Error';

    return {
      name: sanitizeText(name),
      code,
      statusCode,
      message: 'Unexpected failure'
    };
  };

  http.globalAgent.maxSockets = Infinity;
  https.globalAgent.maxSockets = Infinity;

  const server = fastify({
    logger:
      process.env.FASTIFY_LOGGER === 'true'
        ? { level: process.env.FASTIFY_LOG_LEVEL || 'warn' }
        : false,
    trustProxy: true,
    onProtoPoisoning: 'ignore',
    frameworkErrors: (error, request, reply) => {
      request.log.error(
        { err: sanitizeErrorForLogging(error) },
        'Framework error intercepted'
      );
      reply
        .status(500)
        .type('application/json')
        .send(getGenericHttpErrorBody(500));
    },
    https: getHttpsOptions()
  });

  server.setErrorHandler((error, request, reply) => {
    const rawStatusCode =
      typeof error?.statusCode === 'number' ? error.statusCode : 500;
    const statusCode =
      rawStatusCode >= 400 && rawStatusCode < 600 ? rawStatusCode : 500;
    const responseBody =
      statusCode >= 500
        ? getGenericHttpErrorBody(statusCode)
        : getSanitizedHttpExceptionBody(
            statusCode,
            typeof (error as { response?: unknown })?.response !== 'undefined'
              ? (error as { response?: unknown }).response
              : undefined
          );

    if (statusCode >= 500) {
      request.log.error(
        { err: sanitizeErrorForLogging(error), statusCode },
        'Request error intercepted'
      );
    } else {
      request.log.warn(
        { err: sanitizeErrorForLogging(error), statusCode },
        'Request error intercepted'
      );
    }

    reply
      .status(statusCode)
      .type('application/json')
      .send(responseBody);
  });

  const denyVcsArtifactPath = (value: string) => {
    let decodedValue = value;

    try {
      decodedValue = decodeURIComponent(value);
    } catch {
      decodedValue = value;
    }

    const normalizedPath = decodedValue
      .split('?')[0]
      .replace(/\\/g, '/')
      .replace(/\/+/g, '/');
    const pathSegments = normalizedPath
      .split('/')
      .filter(Boolean)
      .map((segment) => segment.trim().toLowerCase());
    const deniedSecretFilePattern = /^\.(env($|\..+)|htaccess|npmrc|yarnrc|pnpmrc|ssh|aws|dockerenv)|.+\.(pem|key|crt|p12|pfx)$/;

    return pathSegments.some((segment) => {
      const normalizedSegment = segment.startsWith('.')
        ? segment.slice(1)
        : segment;

      return (
        segment.startsWith('.') ||
        deniedSecretFilePattern.test(segment) ||
        normalizedSegment === 'git' ||
        normalizedSegment === 'svn' ||
        normalizedSegment === 'hg' ||
        normalizedSegment === 'vcs'
      );
    });
  };

  const vcsArtifactRoots = [
    join(__dirname, '..', 'client', 'vcs'),
    join(__dirname, '..', 'client', '.svn'),
    join(__dirname, '..', 'client', '.git'),
    join(__dirname, '..', 'client', '.hg'),
    join(__dirname, '..', '.svn'),
    join(__dirname, '..', '.git'),
    join(__dirname, '..', '.hg')
  ];

  for (const artifactRoot of vcsArtifactRoots) {
    try {
      if (statSync(artifactRoot).isDirectory()) {
        server.log.warn(`VCS artifact directory present and excluded: ${artifactRoot}`);
      }
    } catch {
      // Directory does not exist; nothing to do.
    }
  };

  const isAllowedStaticPath = (pathName: string) => {
    if (denyVcsArtifactPath(pathName)) {
      return false;
    }

    const normalizedPath = pathName.split('?')[0].toLowerCase();
    const deniedStaticPaths = new Set(['/config.js', '/nginx.conf', '/.htaccess']);
    const pathSegments = normalizedPath.split('/').filter(Boolean);

    if (deniedStaticPaths.has(normalizedPath)) {
      return false;
    }

    if (pathSegments.some((segment) => segment.startsWith('.'))) {
      return false;
    }

    return !normalizedPath.endsWith('.conf');
  };

  server.setDefaultRoute((req, res) => {
    const requestPath = req.url?.split('?')[0] || '';

    if (denyVcsArtifactPath(requestPath)) {
      res.statusCode = 404;
      return res.end('Not Found');
    }

    if (requestPath.startsWith('/api')) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      return res.end(
        JSON.stringify(getGenericHttpErrorBody(404))
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
    allowedPath: (pathName) => isAllowedStaticPath(pathName)
  });


  await server.register(fastifyStatic, {
    root: join(__dirname, '..', 'client', 'dist', 'vendor'),
    prefix: `/vendor`,
    decorateReply: false,
    redirect: true,
    index: false,
    serveDotFiles: false,
    allowedPath: (pathName) => isAllowedStaticPath(pathName)
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
      logger: ['error', 'warn']
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

  app.useGlobalInterceptors(new HeadersConfiguratorInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter(httpAdapter));

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
