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

test('OPTIONS /grpc/com.example.Greeter/SayHello', { signal: AbortSignal.timeout(timeout) }, async () => {
  await runner
    .createScan({
      tests: ['csrf', 'http_method_fuzzing'],
      attackParamLocations: [AttackParamLocation.HEADER],
      starMetadata: {
        code_source: 'NeuraLegion/brokencrystals:stable',
        databases: ['PostgreSQL'],
        user_roles: null
      },
      poolSize: +process.env.SECTESTER_SCAN_POOL_SIZE || undefined
    })
    .setFailFast(false)
    .timeout(timeout)
    .run({
      method: HttpMethod.OPTIONS,
      url: `${baseUrl}/grpc/com.example.Greeter/SayHello`,
      headers: {
        'Access-Control-Request-Headers': 'content-type,x-grpc-web',
        'Access-Control-Request-Method': 'POST',
        Origin: 'https://example.com'
      }
    });
});