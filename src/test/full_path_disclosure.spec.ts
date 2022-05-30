import { SecRunner, SecScan } from '@sec-tester/runner';
import { TestType } from '@sec-tester/scan';

describe('/api', () => {
  let runner: SecRunner;
  let scan: SecScan;

  beforeEach(async () => {
    runner = new SecRunner({ hostname: process.env.BRIGHT_CLUSTER });
    await runner.init();
  });

  afterEach(() => runner.clear());

  describe('POST /subscriptions', () => {
    it('should not contain errors that include full webroot path', () => {
      return runner
        .createScan({
          tests: [TestType.FULL_PATH_DISCLOSURE],
          name: 'FULL_PATH_DISCLOSURE',
        })
        .timeout(3000000)
        .run({
          method: 'POST',
          url: `${process.env.SEC_TESTER_TARGET}/api/subscriptions?email=lorem`,
        });
    });
  });
  describe('GET /auth/oidc-client', () => {
    it('should not contain errors that include full webroot path', () => {
      return runner
        .createScan({
          tests: [TestType.FULL_PATH_DISCLOSURE],
          name: 'FULL_PATH_DISCLOSURE',
        })
        .timeout(3000000)
        .run({
          method: 'GET',
          url: `${process.env.SEC_TESTER_TARGET}/api/auth/oidc-client?`,
        });
    });
  });
  describe('GET /users/one/{email}/adminpermission', () => {
    it('should not contain errors that include full webroot path', () => {
      return runner
        .createScan({
          tests: [TestType.FULL_PATH_DISCLOSURE],
          name: 'FULL_PATH_DISCLOSURE',
        })
        .timeout(3000000)
        .run({
          method: 'GET',
          url: `${process.env.SEC_TESTER_TARGET}/api/users/one/undefined/adminpermission?`,
        });
    });
  });
});
