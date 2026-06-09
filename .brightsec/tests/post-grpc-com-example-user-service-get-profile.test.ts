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

test('POST /grpc/com.example.UserService/GetProfile', { signal: AbortSignal.timeout(timeout) }, async () => {
  await runner
    .createScan({
      tests: ['jwt', 'id_enumeration', 'bopla', 'http_method_fuzzing'],
      attackParamLocations: [AttackParamLocation.HEADER, AttackParamLocation.BODY],
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
      url: `${baseUrl}/grpc/com.example.UserService/GetProfile`,
      body: '<binary protobuf payload for GetProfileRequest>',
      headers: {
        'content-type': 'application/grpc-web+proto',
        'x-grpc-web': '1',
        'x-user-agent': 'grpc-web-javascript/0.1'
      }
    });
});