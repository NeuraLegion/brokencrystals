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

  describe('POST /metadata', () => {
    it('should not contains forms liable vulnerable cross-site filling and submitting', async () => {
      await runner
        .createScan({ tests: [TestType.CSRF], name: 'CSRF' })
        .timeout(3000000)
        .run({
          method: 'POST',
          url: `${process.env.SEC_TESTER_TARGET}/api/metadata`,
          query: {
            xml:
              '%3C%3Fxml+version%3D%221.0%22+encoding%3D%22UTF-8%22%3F%3E%3C%21DOCTYPE+child+%5B+%3C%21ENTITY+child+SYSTEM+%22file%3A%2F%2F%2Fetc%2Fpasswd%22%3E+%5D%3E%3Cchild%3E%3C%2Fchild%3E',
          },
        });
    });
  });
});
