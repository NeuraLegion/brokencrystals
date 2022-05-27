
import { SecRunner, SecScan } from '@sec-tester/runner'
import { TestType, Severity } from '@sec-tester/scan'
import { Configuration } from "@sec-tester/core";

describe('SSTI', () => {
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

  it('SSTI', async () => {
    scan = runner.createScan({ tests: [TestType.SSTI], name: 'SSTI' })
      .timeout(3000000);
    await scan.run({
      method: 'POST',
      headers: {
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "text/plain",
        "Origin": process.env.URL
      },
      body: `{{=""+1""}} {{=5589}} {{=55488}} {{=55}}{{=840931+350734}}`,
      url: `${process.env.URL}/api/render?`
    })
  })
})

