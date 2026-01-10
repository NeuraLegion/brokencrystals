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

test('POST /api/users/basic', { signal: AbortSignal.timeout(timeout) }, async () => {
  await runner
    .createScan({
      tests: ['bopla', 'csrf', 'email_injection', 'sqli', 'xss'],
      attackParamLocations: [AttackParamLocation.BODY],
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
      url: `${baseUrl}/api/users/basic`,
      body: {
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        company: 'Bright Security',
        id: 1,
        cardNumber: '4263982640269299',
        phoneNumber: '12065550100',
        password: 'Pa55w0rd',
        op: 'basic'
      },
      headers: { 'Content-Type': 'application/json' },
      auth: process.env.BRIGHT_AUTH_ID
    });
});