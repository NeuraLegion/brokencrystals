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

test('GET /api/email/sendSupportEmail', { signal: AbortSignal.timeout(timeout) }, async () => {
  await runner
    .createScan({
      tests: ['proto_pollution', 'email_injection', 'xss'],
      attackParamLocations: [AttackParamLocation.QUERY],
      starMetadata: {
        code_source: 'NeuraLegion/brokencrystals:stable',
        databases: ['PostgreSQL']
      },
      poolSize: +process.env.SECTESTER_SCAN_POOL_SIZE || undefined
    })
    .setFailFast(false)
    .timeout(timeout)
    .run({
      method: HttpMethod.GET,
      url: `${baseUrl}/api/email/sendSupportEmail?name=Bob%20Dylan&to=username%40email.com&subject=Help%20Request&content=I%20would%20like%20to%20request%20help%20regarding..`,
      headers: { 'Content-Type': 'application/json' },
      auth: process.env.BRIGHT_AUTH_ID
    });
});