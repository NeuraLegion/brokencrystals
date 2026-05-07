const express = require('express');
const fs = require('fs');
require('reflect-metadata');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

function sendText(res, body, status = 200) {
  res.status(status);
  res.set('content-type', 'text/plain; charset=utf-8');
  if (body === undefined || body === null) return res.send('');
  if (Buffer.isBuffer(body)) return res.send(body.toString('utf8'));
  if (typeof body === 'string') return res.send(body);
  try {
    return res.send(JSON.stringify(body, null, 2));
  } catch {
    return res.send(String(body));
  }
}

function safeRequire(modulePath) {
  try {
    return { ok: true, mod: require(modulePath) };
  } catch (err) {
    console.warn(`[harness] Failed to load ${modulePath}: ${err.message}`);
    return { ok: false, err };
  }
}

function instantiateExportedClass(mod, preferredNames = []) {
  const candidates = [];
  for (const name of preferredNames) {
    if (mod && mod[name]) candidates.push(mod[name]);
  }
  if (mod && typeof mod === 'function') candidates.push(mod);
  if (mod && typeof mod.default === 'function') candidates.push(mod.default);
  if (mod && typeof mod === 'object') {
    for (const v of Object.values(mod)) {
      if (typeof v === 'function') candidates.push(v);
    }
  }
  for (const Ctor of candidates) {
    try {
      return new Ctor();
    } catch (e) {
      try {
        return Object.create(Ctor.prototype);
      } catch (_) {}
    }
  }
  return null;
}

function firstDefined(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function parseMaybeJson(value) {
  if (value === undefined) return undefined;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

const targets = {};

function registerTarget(key, route, method, handler) {
  targets[key] = { route, method, handler };
}

/*
Root-cause fixes from source review:

1) HttpClientService.*:
   The service uses axios.get(url). The failing requests attempted to fetch
   127.0.0.1:3000, where nothing is listening in the harness container, so the
   harness returned ECONNREFUSED. The harness should provide a safe default URL
   that resolves locally inside the harness itself unless the caller supplies one.

2) McpResourceExecutorService.readResource:
   For file:// URIs, source code proxies to http://127.0.0.1:3000/api/file/raw
   via McpProxySupport. That backend app is not running in the harness, causing
   ECONNREFUSED. To exercise the target logic without removing the endpoint,
   instantiate the service and override readFileResource to perform the same core
   file-reading behavior directly from the local filesystem.

3) FileService.deleteFile:
   Source code immediately calls file.startsWith(...). The harness passed
   req.query.file only; for some DELETE requests that was undefined, producing
   "Cannot read properties of undefined (reading 'startsWith')". The harness
   should normalize input from query/body and default to '' so the service
   receives a string.
*/

function getUrlInput(req, fallbackPath = '/health') {
  return firstDefined(
    req.query.url,
    req.body && req.body.url,
    `http://127.0.0.1:${PORT}${fallbackPath}`
  );
}

function getFileInput(req) {
  return String(
    firstDefined(
      req.query.file,
      req.body && req.body.file,
      req.query.path,
      req.body && req.body.path,
      ''
    )
  );
}

/* Tier 1 targets */
const httpclientMod = safeRequire('./src/httpclient/httpclient.service');
if (httpclientMod.ok) {
  const svc = instantiateExportedClass(httpclientMod.mod, ['HttpClientService']);
  if (svc) {
    registerTarget(
      'httpclientservice-loadjson',
      '/harness/httpclientservice-loadjson',
      'get',
      async (req) => svc.loadJSON(getUrlInput(req, '/health-json'))
    );
    registerTarget(
      'httpclientservice-get',
      '/harness/httpclientservice-get',
      'get',
      async (req) => svc.get(getUrlInput(req, '/health'))
    );
    registerTarget(
      'httpclientservice-loadplain',
      '/harness/httpclientservice-loadplain',
      'get',
      async (req) => svc.loadPlain(getUrlInput(req, '/health'))
    );
    registerTarget(
      'httpclientservice-loadany',
      '/harness/httpclientservice-loadany',
      'get',
      async (req) => svc.loadAny(getUrlInput(req, '/health'))
    );
  } else {
    console.warn('[harness] HttpClientService not instantiated');
  }
}

const ldapMod = safeRequire('./src/users/ldap.query.handler');
if (ldapMod.ok) {
  const handler = instantiateExportedClass(ldapMod.mod, ['LdapQueryHandler']);
  if (handler) {
    registerTarget(
      'ldapqueryhandler-parsequery',
      '/harness/ldapqueryhandler-parsequery',
      'get',
      async (req) => handler.parseQuery(req.query.query)
    );
  } else {
    console.warn('[harness] LdapQueryHandler not instantiated');
  }
}

const partnersMod = safeRequire('./src/partners/partners.service');
if (partnersMod.ok) {
  const svc = instantiateExportedClass(partnersMod.mod, ['PartnersService']);
  if (svc) {
    registerTarget(
      'partnersservice-getpartnersproperties',
      '/harness/partnersservice-getpartnersproperties',
      'get',
      async (req) => svc.getPartnersProperties(req.query.xpathExpression)
    );
  } else {
    console.warn('[harness] PartnersService not instantiated');
  }
}

const mcpToolMod = safeRequire('./src/mcp/mcp.tool-executor.service');
if (mcpToolMod.ok) {
  const svc = instantiateExportedClass(mcpToolMod.mod, ['McpToolExecutorService']);
  if (svc) {
    registerTarget(
      'mcptoolexecutorservice-executerendertool',
      '/harness/mcptoolexecutorservice-executerendertool',
      'post',
      async (req) => svc.executeRenderTool(parseMaybeJson(req.body))
    );
    registerTarget(
      'mcptoolexecutorservice-executespawntool',
      '/harness/mcptoolexecutorservice-executespawntool',
      'post',
      async (req) =>
        svc.executeSpawnTool(
          parseMaybeJson(req.body.input),
          parseMaybeJson(req.body.context) || {}
        )
    );
    registerTarget(
      'mcptoolexecutorservice-executeupdateusertool',
      '/harness/mcptoolexecutorservice-executeupdateusertool',
      'post',
      async (req) => svc.executeUpdateUserTool(parseMaybeJson(req.body))
    );
  } else {
    console.warn('[harness] McpToolExecutorService not instantiated');
  }
}

const mcpResourceMod = safeRequire('./src/mcp/mcp.resource-executor.service');
if (mcpResourceMod.ok) {
  const svc = instantiateExportedClass(mcpResourceMod.mod, ['McpResourceExecutorService']);
  if (svc) {
    if (typeof svc.readFileResource === 'function') {
      svc.readFileResource = async function harnessReadFileResource(
        uri,
        _authorizationHeader
      ) {
        const parsed = new URL(uri);
        const filePath = decodeURIComponent(parsed.pathname || '');
        if (!filePath.length) {
          throw new Error('Invalid resource URI: file path is required');
        }
        const text = await fs.promises.readFile(filePath, 'utf8');
        return {
          contents: [
            {
              uri,
              mimeType: 'text/plain',
              text
            }
          ]
        };
      };
    }

    registerTarget(
      'mcpresourceexecutorservice-readresource',
      '/harness/mcpresourceexecutorservice-readresource',
      'get',
      async (req) => {
        const uri = firstDefined(
          req.query.uri,
          req.body && req.body.uri,
          `http://127.0.0.1:${PORT}/health`
        );
        const authorizationHeader = firstDefined(
          req.query.authorizationHeader,
          req.body && req.body.authorizationHeader
        );
        return svc.readResource(uri, authorizationHeader);
      }
    );
  } else {
    console.warn('[harness] McpResourceExecutorService not instantiated');
  }
}

const fileMod = safeRequire('./src/file/file.service');
if (fileMod.ok) {
  const svc = instantiateExportedClass(fileMod.mod, ['FileService']);
  if (svc) {
    registerTarget(
      'fileservice-getfile',
      '/harness/fileservice-getfile',
      'get',
      async (req) => svc.getFile(getFileInput(req))
    );
    registerTarget(
      'fileservice-deletefile',
      '/harness/fileservice-deletefile',
      'delete',
      async (req) => svc.deleteFile(getFileInput(req))
    );
  } else {
    console.warn('[harness] FileService not instantiated');
  }
}

/* Tier 2 target: TestimonialsService with minimal DB connection only */
let testimonialsSvc = null;
(function initTestimonials() {
  const mod = safeRequire('./src/testimonials/testimonials.service');
  if (!mod.ok) return;

  let mikroNest;
  try {
    mikroNest = require('@mikro-orm/nestjs');
    require('./src/model/testimonial.entity');
  } catch (err) {
    console.warn(`[harness] TestimonialsService deps unavailable: ${err.message}`);
    return;
  }

  const injectRepoKey = Object.keys(mikroNest).find((k) => k === 'InjectRepository');
  const originalInjectRepository = injectRepoKey ? mikroNest[injectRepoKey] : null;
  if (injectRepoKey) mikroNest.InjectRepository = () => () => {};

  try {
    let connection;
    try {
      const { Client } = require('pg');
      connection = {
        execute: async (query, params) => {
          const client = new Client({
            host: process.env.DATABASE_HOST || 'db',
            port: +(process.env.DATABASE_PORT || 5432),
            user: process.env.DATABASE_USER || 'bc',
            password: process.env.DATABASE_PASSWORD || 'bc',
            database: process.env.DATABASE_SCHEMA || 'bc'
          });
          await client.connect();
          try {
            const res = await client.query(query, params);
            return res.rows;
          } finally {
            await client.end();
          }
        }
      };
    } catch (err) {
      console.warn(`[harness] pg unavailable for testimonials: ${err.message}`);
      return;
    }

    const TestimonialsService =
      mod.mod.TestimonialsService ||
      mod.mod.default ||
      (typeof mod.mod === 'function' ? mod.mod : null);

    if (!TestimonialsService) {
      console.warn('[harness] TestimonialsService export not found');
      return;
    }

    testimonialsSvc = new TestimonialsService(
      { findAll: async () => [] },
      { getConnection: () => connection }
    );

    registerTarget(
      'testimonialsservice-count',
      '/harness/testimonialsservice-count',
      'get',
      async (req) => testimonialsSvc.count(req.query.query)
    );
  } catch (err) {
    console.warn(`[harness] Failed to initialize TestimonialsService: ${err.message}`);
  } finally {
    if (injectRepoKey && originalInjectRepository) {
      mikroNest.InjectRepository = originalInjectRepository;
    }
  }
})();

app.get('/health', (req, res) => sendText(res, 'ok'));
app.get('/health-json', (req, res) => {
  res.status(200).json({ ok: true });
});

for (const { route, method, handler } of Object.values(targets)) {
  app[method](route, async (req, res) => {
    try {
      const result = await handler(req, res);
      if (result && typeof result.pipe === 'function') {
        res.status(200);
        res.set('content-type', 'text/plain; charset=utf-8');
        result.on('data', (chunk) => res.write(chunk));
        result.on('end', () => res.end());
        result.on('error', (err) => sendText(res, err.message, 500));
        return;
      }
      if (Buffer.isBuffer(result)) return sendText(res, result, 200);
      return sendText(res, result, 200);
    } catch (err) {
      sendText(res, err && err.message ? err.message : String(err), 500);
    }
  });
}

app.use((req, res) => sendText(res, 'Not found', 404));

const PORT = parseInt(process.env.PORT || '3001', 10);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[harness] listening on ${PORT}`);
  console.log(
    `[harness] registered routes: ${Object.values(targets)
      .map((t) => t.route)
      .join(', ')}`
  );
});
