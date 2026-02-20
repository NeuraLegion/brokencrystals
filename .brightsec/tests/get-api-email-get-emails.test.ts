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

test('GET /api/email/getEmails', { signal: AbortSignal.timeout(timeout) }, async () => {
  await runner
    .createScan({
      tests: ['proto_pollution', 'business_constraint_bypass', 'improper_asset_management', 'xss'],
      attackParamLocations: [AttackParamLocation.QUERY, AttackParamLocation.HEADER],
      starMetadata: {
        "code_source": "NeuraLegion/brokencrystals:stable",
        "databases": ["PostgreSQL"],
        "user_roles": [
          "default-roles-brokencrystals",
          "offline_access",
          "uma_authorization",
          "query-users",
          "view-authorization",
          "create-client",
          "realm-admin",
          "manage-users",
          "manage-authorization",
          "query-realms",
          "view-events",
          "manage-clients",
          "view-realm",
          "manage-realm",
          "impersonation",
          "query-clients",
          "query-groups",
          "manage-events",
          "view-clients",
          "view-identity-providers",
          "view-users",
          "manage-identity-providers",
          "read-token",
          "view-profile",
          "manage-account-links",
          "manage-account",
          "manage-consent",
          "view-applications",
          "view-consent",
          "delete-account",
          "guest",
          "user",
          "admin"
        ]
      },
      poolSize: +process.env.SECTESTER_SCAN_POOL_SIZE || undefined
    })
    .setFailFast(false)
    .timeout(timeout)
    .run({
      method: HttpMethod.GET,
      url: `${baseUrl}/api/email/getEmails?withSource=true`,
      headers: { 'Content-Type': 'application/json' },
      auth: process.env.BRIGHT_AUTH_ID
    });
});