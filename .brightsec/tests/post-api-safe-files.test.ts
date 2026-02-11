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

test('POST /api/safe-files', { signal: AbortSignal.timeout(timeout) }, async () => {
  await runner
    .createScan({
      tests: ['ssrf', 'unvalidated_redirect', 'open_cloud_storage', 'xss'],
      attackParamLocations: [AttackParamLocation.BODY],
      starMetadata: {
        code_source: "NeuraLegion/brokencrystals:dependabot/npm_and_yarn/client/axios-1.13.5",
        databases: ["PostgreSQL"],
        user_roles: null
      },
      poolSize: +process.env.SECTESTER_SCAN_POOL_SIZE || undefined
    })
    .setFailFast(false)
    .timeout(timeout)
    .run({
      method: HttpMethod.POST,
      url: `${baseUrl}/api/safe-files`,
      body: {
        name: 'exampleFile',
        url: 'https://example.com/file.txt'
      },
      headers: { 'Content-Type': 'application/json' }
    });
});