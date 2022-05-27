
import { SecRunner, SecScan } from '@sec-tester/runner'
import { TestType, Severity } from '@sec-tester/scan'
import { Configuration } from "@sec-tester/core";

describe('INSECURE_TLS_CONFIGURATION', () => {
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

  it('INSECURE_TLS_CONFIGURATION', async () => {
  scan = runner.createScan({ tests: [TestType.INSECURE_TLS_CONFIGURATION], name: 'INSECURE_TLS_CONFIGURATION' })
    .timeout(3000000);
  await scan.run({
    method: 'GET',
    url: `${process.env.URL}`
  })
})
})
