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

test('PUT /api/users/one/:email/info', { signal: AbortSignal.timeout(timeout) }, async () => {
  await runner
    .createScan({
      tests: ['jwt', 'xss', 'csrf'],
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
      method: HttpMethod.PUT,
      url: `${baseUrl}/api/users/one/john.doe@example.com/info`,
      body: {
        email: "john.doe@example.com",
        firstName: "John",
        lastName: "Doe",
        company: "Bright Security",
        id: 1,
        phoneNumber: "12065550100"
      },
      headers: { 'Authorization': 'Bearer <JWT_TOKEN>', 'Content-Type': 'application/json' },
      auth: process.env.BRIGHT_AUTH_ID
    });
});