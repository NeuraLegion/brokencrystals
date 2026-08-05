import { SecRunner } from '@sectester/runner';

describe('/api', () => {
  const timeout = 600000;
  jest.setTimeout(timeout);

  let runner: SecRunner;

  beforeEach(async () => {
    runner = new SecRunner({ hostname: process.env.BRIGHT_CLUSTER });
    await runner.init();
  });

  afterEach(() => runner.clear());

  describe('GET /testimonials/count', () => {
    it('should not execute commands for SQL database', async () => {
      await runner
        .createScan({
          tests: ['sqli'],
          name: expect.getState().currentTestName
        })
        .timeout(timeout)
        .run({
          method: 'GET',
          url: `${process.env.SEC_TESTER_TARGET}/api/testimonials/count`
        });
    });
  });
});
