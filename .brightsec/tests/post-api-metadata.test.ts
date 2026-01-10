import { test, before, after } from 'node:test';
import { SecRunner } from '@sectester/runner';
import { AttackParamLocation, HttpMethod } from '@sectester/scan';

const timeout = 40 * 60 * 1000;
const baseUrl = process.env.BRIGHT_TARGET_URL!;

let runner!: SecRunner;

before(async () => {
  runner = new SecRunner({
    hostname: process.env.BRIGHT_HOSTNAME!,
    projectId: process.env.BRIGHT_PROJECT_ID!
  });

  await runner.init();
});

after(() => runner.clear());

test('POST /api/metadata', { signal: AbortSignal.timeout(timeout) }, async () => {
  await runner
    .createScan({
      tests: ['xxe', 'xss', 'secret_tokens'],
      attackParamLocations: [AttackParamLocation.BODY, AttackParamLocation.HEADER],
      starMetadata: {
        code_source: 'NeuraLegion/brokencrystals:stable',
        databases: ['PostgreSQL']
      },
      poolSize: +process.env.SECTESTER_SCAN_POOL_SIZE || undefined
    })
    .setFailFast(false)
    .timeout(timeout)
    .run({
      method: HttpMethod.POST,
      url: `${baseUrl}/api/metadata`,
      body: `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 915 585">\n  <g stroke-width="3.45" fill="none">\n    <path stroke="#000" d="M11.8 11.8h411v411l-411 .01v-411z"/>\n    <path stroke="#448" d="M489 11.7h415v411H489v-411z"/>\n  </g>\n</svg>`,
      headers: { 'Content-Type': 'text/xml' },
      auth: process.env.BRIGHT_AUTH_ID
    });
});