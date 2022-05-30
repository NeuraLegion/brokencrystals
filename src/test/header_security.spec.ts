
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

  describe('GET /config', () => {
    it('should contain proper Security Headers configuration', () => {
      return runner.createScan({ tests: [TestType.HEADER_SECURITY], name: 'HEADER_SECURITY' })
        .timeout(3000000)
        .run({
          method: 'GET',
          url: `${process.env.SEC_TESTER_TARGET}/api/config?query=no-sec-headers`
        });
    });
  });
});
