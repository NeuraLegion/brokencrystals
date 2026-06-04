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

test('GET /api/partners/query?no-sec-headers=:no-sec-headers&xpath=:xpath', { signal: AbortSignal.timeout(timeout) }, async () => {
  await runner
    .createScan({
      tests: [
        'xpathi',
        {
          name: 'broken_access_control',
          options: {
            auth: process.env.BRIGHT_AUTH_ID
          }
        },
        'full_path_disclosure'
      ],
      attackParamLocations: [AttackParamLocation.QUERY],
      starMetadata: {
        code_source: 'NeuraLegion/brokencrystals:stable',
        databases: ['PostgreSQL'],
        user_roles: ['guest', 'user', 'admin']
      },
      poolSize: +process.env.SECTESTER_SCAN_POOL_SIZE || undefined
    })
    .setFailFast(false)
    .timeout(timeout)
    .run({
      method: HttpMethod.GET,
      url: `${baseUrl}/api/partners/query?no-sec-headers=1&xpath=%2Fpartners%2Fpartner%2Fname`,
      headers: {
        Cookie: 'bc-calls-counter=1717171717171'
      },
      auth: process.env.BRIGHT_AUTH_ID
    });
});