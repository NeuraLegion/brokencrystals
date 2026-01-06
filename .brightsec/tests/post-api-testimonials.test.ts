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

test('POST /api/testimonials', { signal: AbortSignal.timeout(timeout) }, async () => {
  await runner
    .createScan({
      tests: ['xss', 'sqli', 'csrf', 'jwt'],
      attackParamLocations: [AttackParamLocation.BODY, AttackParamLocation.HEADER],
      starMetadata: {
        code_source: "NeuraLegion/brokencrystals:stable",
        databases: ["PostgreSQL"]
      },
      poolSize: +process.env.SECTESTER_SCAN_POOL_SIZE || undefined
    })
    .setFailFast(false)
    .timeout(timeout)
    .run({
      method: HttpMethod.POST,
      url: `${baseUrl}/api/testimonials`,
      body: {
        name: "John Doe",
        title: "Great Service",
        message: "I had an excellent experience with the service provided."
      },
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer <JWT_TOKEN>'
      },
      auth: process.env.BRIGHT_AUTH_ID
    });
});