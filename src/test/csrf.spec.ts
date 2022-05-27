
import { SecRunner, SecScan } from '@sec-tester/runner'
import { TestType, Severity } from '@sec-tester/scan'
import { Configuration } from "@sec-tester/core";

describe('CSRF', () => {
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

  it('CSRF', async () => {
    scan = runner.createScan({ tests: [TestType.CSRF], name: 'CSRF' })
      .timeout(3000000);
    await scan.run({
      method: 'POST',
      url: `${process.env.URL}/api/metadata?xml=%3C%3Fxml+version%3D%221.0%22+encoding%3D%22UTF-8%22%3F%3E%3C%21DOCTYPE+child+%5B+%3C%21ENTITY+child+SYSTEM+%22file%3A%2F%2F%2Fetc%2Fpasswd%22%3E+%5D%3E%3Cchild%3E%3C%2Fchild%3E`
    })
  })
})
