
import { SecRunner, SecScan } from '@sec-tester/runner'
import { TestType, Severity } from '@sec-tester/scan'
import { Configuration } from "@sec-tester/core";

describe('COMMON_FILES', () => {
  let runner: SecRunner;
  let scan: SecScan;
   let configuration: Configuration = new Configuration({
    hostname: process.env.BRIGHT_CLUSTER
  });


  beforeEach(async () => {
    runner = new SecRunner(configuration);
    await runner.init();

  });

  afterEach(async () => {
    await runner.clear();
  });

  it('COMMON_FILES', async () => {
    scan = runner.createScan({ tests: [TestType.COMMON_FILES, TestType.COOKIE_SECURITY, TestType.CSRF, ], name: 'COMMON_FILES' })
    .timeout(3000000);
  await scan.run({
    method: 'GET',
    url: `${process.env.URL}`
  })
})
})
