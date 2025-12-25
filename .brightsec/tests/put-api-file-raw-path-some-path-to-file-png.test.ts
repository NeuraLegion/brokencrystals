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

test('PUT /api/file/raw?path=some/path/to/file.png', { signal: AbortSignal.timeout(timeout) }, async () => {
  await runner
    .createScan({
      tests: ['file_upload', 'lfi', 'osi', 'full_path_disclosure'],
      attackParamLocations: [AttackParamLocation.QUERY, AttackParamLocation.BODY],
      starMetadata: {
        code_source: 'NeuraLegion/brokencrystals:stable',
        databases: ['PostgreSQL']
      },
      poolSize: +process.env.SECTESTER_SCAN_POOL_SIZE || undefined
    })
    .setFailFast(false)
    .timeout(timeout)
    .run({
      method: HttpMethod.PUT,
      url: `${baseUrl}/api/file/raw?path=some/path/to/file.png`,
      body: 'Sample raw file content',
      headers: { 'Content-Type': 'text/plain' },
      auth: process.env.BRIGHT_AUTH_ID
    });
});