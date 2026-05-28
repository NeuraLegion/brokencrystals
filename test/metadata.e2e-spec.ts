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

  describe('POST /metadata', () => {
    it('should not inject external entities into XML', async () => {
      await runner
        .createScan({
          tests: ['xxe'],
          name: expect.getState().currentTestName
        })
        .timeout(timeout)
        .run({
          method: 'POST',
          url: `${process.env.SEC_TESTER_TARGET}/api/metadata`,
          body: '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>\n<username>&xxe;</username>'
        });
    });
  });
});
