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

test('GET /api/users/fullinfo/:email', { signal: AbortSignal.timeout(timeout) }, async () => {
  await runner
    .createScan({
      tests: ['ldapi', 'id_enumeration', 'xss', 'sqli', 'full_path_disclosure'],
      attackParamLocations: [AttackParamLocation.PATH],
      starMetadata: {
        code_source: "NeuraLegion/brokencrystals:stable",
        databases: ["PostgreSQL"]
      },
      poolSize: +process.env.SECTESTER_SCAN_POOL_SIZE || undefined
    })
    .setFailFast(false)
    .timeout(timeout)
    .run({
      method: HttpMethod.GET,
      url: `${baseUrl}/api/users/fullinfo/john.doe@example.com`,
      auth: process.env.BRIGHT_AUTH_ID
    });
});