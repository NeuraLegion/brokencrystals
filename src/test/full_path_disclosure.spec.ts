
import { SecRunner, SecScan } from '@sec-tester/runner'
import { TestType, Severity } from '@sec-tester/scan'
import { Configuration } from "@sec-tester/core";

describe('FULL_PATH_DISCLOSURE', () => {
  let runner: SecRunner;
  let scan: SecScan;
  let configuration: Configuration = new Configuration({
    hostname: process.env.BRIGHT_CLUSTER
  })

  beforeEach(async () => {
    runner = new SecRunner(configuration);
    await runner.init();

  });

  afterEach(async () => {
    await runner.clear();
  });

  it('FULL_PATH_DISCLOSURE', async () => {
    scan = runner.createScan({ tests: [TestType.FULL_PATH_DISCLOSURE], name: 'FULL_PATH_DISCLOSURE' })
      .timeout(3000000);
    await scan.run({
      method: 'POST',
      url: `${process.env.URL}/api/subscriptions?email=lorem`
    })
  })
  it('FULL_PATH_DISCLOSURE', async () => {
    scan = runner.createScan({ tests: [TestType.FULL_PATH_DISCLOSURE], name: 'FULL_PATH_DISCLOSURE' })
      .timeout(3000000);
    await scan.run({
      method: 'GET',
      url: `${process.env.URL}/api/auth/oidc-client?`
    })
  })
  it('FULL_PATH_DISCLOSURE', async () => {
    scan = runner.createScan({ tests: [TestType.FULL_PATH_DISCLOSURE], name: 'FULL_PATH_DISCLOSURE' })
      .timeout(3000000);
    await scan.run({
      method: 'GET',
      url: `${process.env.URL}/api/users/one/undefined/adminpermission?`
    })
  })
});