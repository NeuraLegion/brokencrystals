import { SecRunner, SecScan } from '@sectester/runner';
import { TestType } from '@sectester/scan';

describe('/api', () => {
  let runner: SecRunner;
  let scan: SecScan;

  beforeEach(async () => {
    runner = new SecRunner({ hostname: process.env.BRIGHT_CLUSTER });
    await runner.init();
  });

  afterEach(() => runner.clear());

  describe('POST /render', () => {
    it('should not contain possibility to server-side code execution', async () => {
      await runner
        .createScan({ tests: [TestType.SSTI], name: 'SSTI' })
        .timeout(3000000)
        .run({
          method: 'POST',
          headers: {
            Accept: 'application/json, text/plain, */*',
            'Content-Type': 'text/plain',
            Origin: process.env.SEC_TESTER_TARGET,
          },
          body: `Some text`,
          url: `${process.env.SEC_TESTER_TARGET}/api/render`,
        });
    });
  });
});
