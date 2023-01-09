import { SecRunner, SecScan } from '@sectester/runner';
import { TestType } from '@sectester/scan';

describe('/', () => {
  let runner: SecRunner;
  let scan: SecScan;

  beforeEach(async () => {
    runner = new SecRunner({ hostname: process.env.BRIGHT_CLUSTER });
    await runner.init();
  });

  afterEach(() => runner.clear());

  describe('GET /', () => {
    it('should not access common files', async () => {
      await runner
        .createScan({ tests: [TestType.COMMON_FILES], name: 'COMMON_FILES' })
        .timeout(3000000)
        .run({
          method: 'GET',
          url: `${process.env.SEC_TESTER_TARGET}`,
        });
    });

    it('should contain proper SSL/TLS ciphers and configurations', async () => {
      await runner
        .createScan({
          tests: [TestType.INSECURE_TLS_CONFIGURATION],
          name: 'INSECURE_TLS_CONFIGURATION',
        })
        .timeout(3000000)
        .run({
          method: 'GET',
          url: `${process.env.SEC_TESTER_TARGET}`,
        });
    });
  });
});
