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

  describe('POST /render', () => {
    it('should not contain possibility to server-side code execution', () => {
      return runner
        .createScan({ tests: [TestType.SSTI], name: 'SSTI' })
        .timeout(3000000)
        .run({
          method: 'POST',
          headers: {
            Accept: 'application/json, text/plain, */*',
            'Content-Type': 'text/plain',
            Origin: process.env.SEC_TESTER_TARGET,
          },
          body: `{{=""+1""}} {{=5589}} {{=55488}} {{=55}}{{=840931+350734}}`,
          url: `${process.env.SEC_TESTER_TARGET}/api/render?`,
        });
    });
  });
});
