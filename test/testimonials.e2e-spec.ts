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

  describe('GET /testimonials/count', () => {
    it('should not execute commands for SQL database', async () => {
      await runner
        .createScan({ tests: [TestType.SQLI], name: 'SQLI' })
        .timeout(3000000)
        .run({
          method: 'GET',
          url: `${process.env.SEC_TESTER_TARGET}/api/testimonials/count?query=lorem`,
        });
    });
  });
});
