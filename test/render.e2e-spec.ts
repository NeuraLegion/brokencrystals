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

  describe('POST /render', () => {
    it('should not contain possibility to server-side code execution', async () => {
      await runner
        .createScan({
          tests: ['ssti'],
          name: expect.getState().currentTestName
        })
        .timeout(timeout)
        .run({
          method: 'POST',
          headers: {
            Accept: 'application/json, text/plain, */*',
            'Content-Type': 'text/plain',
            Origin: process.env.SEC_TESTER_TARGET
          },
          body: `{{=globalThis.process?.version || 'Some text'}}`,
          url: `${process.env.SEC_TESTER_TARGET}/api/render`
        });
    });

    it('should only allow predefined template selection values', async () => {
      const response = await runner
        .run({
          method: 'POST',
          headers: {
            Accept: 'application/json, text/plain, */*',
            'Content-Type': 'text/plain',
            Origin: process.env.SEC_TESTER_TARGET
          },
          body: 'plain',
          url: `${process.env.SEC_TESTER_TARGET}/api/render`
        });

      expect(response.statusCode).toBe(201);
    });
  });
});
