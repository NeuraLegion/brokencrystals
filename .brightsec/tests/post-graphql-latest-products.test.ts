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

test('POST /graphql latestProducts', { signal: AbortSignal.timeout(timeout) }, async () => {
  await runner
    .createScan({
      tests: ['graphql_introspection', 'sqli', 'xss', 'csrf', 'jwt'],
      attackParamLocations: [AttackParamLocation.BODY],
      starMetadata: {
        "code_source": "NeuraLegion/brokencrystals:stable",
        "databases": ["PostgreSQL"],
        "user_roles": null
      },
      poolSize: +process.env.SECTESTER_SCAN_POOL_SIZE || undefined
    })
    .setFailFast(false)
    .timeout(timeout)
    .run({
      method: HttpMethod.POST,
      url: `${baseUrl}/api/graphql`,
      body: {
        query: "query latestProducts { latestProducts { name category photoUrl description viewsCount } }"
      },
      headers: {
        'Content-Type': 'application/json',
        'x-xss-protection': '0',
        'strict-transport-security': 'max-age=0',
        'x-content-type-options': '1',
        'content-security-policy': "default-src  * 'unsafe-inline' 'unsafe-eval'"
      }
    });
});