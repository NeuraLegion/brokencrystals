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

test('POST /graphql GetCommandResult', { signal: AbortSignal.timeout(timeout) }, async () => {
  await runner
    .createScan({
      tests: ['osi', 'graphql_introspection', 'full_path_disclosure', 'http_method_fuzzing'],
      attackParamLocations: [AttackParamLocation.BODY, AttackParamLocation.QUERY],
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
      method: HttpMethod.POST,
      url: `${baseUrl}/graphql?no-sec-headers=false`,
      body: {
        operationName: 'GetCommandResult',
        query: 'query GetCommandResult($command: String!) { getCommandResult(command: $command) }',
        variables: {
          command: 'whoami'
        }
      },
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      }
    });
});