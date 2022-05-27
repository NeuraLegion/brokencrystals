
import { SecRunner, SecScan } from '@sec-tester/runner'
import { TestType, Severity } from '@sec-tester/scan'
import { Configuration } from "@sec-tester/core";
import axios from 'axios';

const generateToken = async (jwtType) => {
  return await axios.post(`${process.env.URL}/api/auth/jwt/${jwtType}/login`, {
    "user": "admin",
    "password": "admin",
    "op": "basic"
  })
    .then(({ headers }) => headers)
    .then(({ authorization }) => {
      return { authorization: authorization }
    })
}

describe('JWT', () => {
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

  it('kid-sql', async () => {
    const jwtType = 'kid-sql'
    scan = runner.createScan({ tests: [TestType.JWT], name: `JWT ${jwtType}` })
      .timeout(3000000);
    await generateToken(jwtType).then((headers) => scan.run({
      method: 'GET',
      headers: headers,
      url: `${process.env.URL}/api/auth/jwt/${jwtType}/validate`
    }))
  })

  it('weak-key', async () => {
    const jwtType = 'weak-key'
    scan = runner.createScan({ tests: [TestType.JWT], name: `JWT ${jwtType}` })
      .timeout(3000000);
    await generateToken(jwtType).then((headers) => scan.run({
      method: 'GET',
      headers: headers,
      url: `${process.env.URL}/api/auth/jwt/${jwtType}/validate`
    }))
  })

  it('jku', async () => {
    const jwtType = 'jku'
    scan = runner.createScan({ tests: [TestType.JWT], name: `JWT ${jwtType}` })
      .timeout(3000000);
    await generateToken(jwtType).then((headers) => scan.run({
      method: 'GET',
      headers: headers,
      url: `${process.env.URL}/api/auth/jwt/${jwtType}/validate`
    }))
  })

  it('jwk', async () => {
    const jwtType = 'jwk'
    scan = runner.createScan({ tests: [TestType.JWT], name: `JWT ${jwtType}` })
      .timeout(3000000);
    await generateToken(jwtType).then((headers) => scan.run({
      method: 'GET',
      headers: headers,
      url: `${process.env.URL}/api/auth/jwt/${jwtType}/validate`
    }))
  })

  it('x5c', async () => {
    const jwtType = 'x5c'
    scan = runner.createScan({ tests: [TestType.JWT], name: `JWT ${jwtType}` })
      .timeout(3000000);
    await generateToken(jwtType).then((headers) => scan.run({
      method: 'GET',
      headers: headers,
      url: `${process.env.URL}/api/auth/jwt/${jwtType}/validate`
    }))
  })

  it('x5u', async () => {
    const jwtType = 'x5u'
    scan = runner.createScan({ tests: [TestType.JWT], name: `JWT ${jwtType}` })
      .timeout(3000000);
    await generateToken(jwtType).then((headers) => scan.run({
      method: 'GET',
      headers: headers,
      url: `${process.env.URL}/api/auth/jwt/${jwtType}/validate`
    }))
  })
})
