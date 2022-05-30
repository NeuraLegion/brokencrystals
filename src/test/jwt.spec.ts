
import { SecRunner, SecScan } from '@sec-tester/runner';
import { TestType } from '@sec-tester/scan';
import axios from 'axios';

const generateToken = async (jwtType) => {
  return await axios.post(`${process.env.SEC_TESTER_TARGET}/api/auth/jwt/${jwtType}/login`, {
    "user": "admin",
    "password": "admin",
    "op": "basic"
  })
    .then(({ headers }) => headers)
    .then(({ authorization }) => {
      return { authorization: authorization };
    });
};

describe('/api', () => {
  let runner: SecRunner;
  let scan: SecScan;

  beforeEach(async () => {
    runner = new SecRunner({ hostname: process.env.BRIGHT_CLUSTER });
    await runner.init();

  });

  afterEach(() => runner.clear());

  describe('GET /auth/jwt/{jwtType}/validate', () => {
    it('should contain secure implementation of JSON Web Token (JWT)', () => {
      const jwtType = 'kid-sql';
      return generateToken(jwtType).then((headers) => runner.createScan({ tests: [TestType.JWT], name: `JWT ${jwtType}` })
        .timeout(3000000)
        .run({
          method: 'GET',
          headers: headers,
          url: `${process.env.SEC_TESTER_TARGET}/api/auth/jwt/${jwtType}/validate`
        }));
    });

    it('should contain secure implementation of JSON Web Token (JWT)', () => {
      const jwtType = 'weak-key';
      return generateToken(jwtType).then((headers) => runner.createScan({ tests: [TestType.JWT], name: `JWT ${jwtType}` })
        .timeout(3000000)
        .run({
          method: 'GET',
          headers: headers,
          url: `${process.env.SEC_TESTER_TARGET}/api/auth/jwt/${jwtType}/validate`
        }));
    });

    it('should contain secure implementation of JSON Web Token (JWT)', () => {
      const jwtType = 'jku';
      return generateToken(jwtType).then((headers) => runner.createScan({ tests: [TestType.JWT], name: `JWT ${jwtType}` })
        .timeout(3000000)
        .run({
          method: 'GET',
          headers: headers,
          url: `${process.env.SEC_TESTER_TARGET}/api/auth/jwt/${jwtType}/validate`
        }));
    });

    it('should contain secure implementation of JSON Web Token (JWT)', () => {
      const jwtType = 'jwk';
      return generateToken(jwtType).then((headers) => runner.createScan({ tests: [TestType.JWT], name: `JWT ${jwtType}` })
        .timeout(3000000)
        .run({
          method: 'GET',
          headers: headers,
          url: `${process.env.SEC_TESTER_TARGET}/api/auth/jwt/${jwtType}/validate`
        }));
    });

    it('should contain secure implementation of JSON Web Token (JWT)', () => {
      const jwtType = 'x5c';
      return generateToken(jwtType).then((headers) => runner.createScan({ tests: [TestType.JWT], name: `JWT ${jwtType}` })
        .timeout(3000000)
        .run({
          method: 'GET',
          headers: headers,
          url: `${process.env.SEC_TESTER_TARGET}/api/auth/jwt/${jwtType}/validate`
        }));
    });

    it('should contain secure implementation of JSON Web Token (JWT)', () => {
      const jwtType = 'x5u';
      return generateToken(jwtType).then((headers) => runner.createScan({ tests: [TestType.JWT], name: `JWT ${jwtType}` })
        .timeout(3000000)
        .run({
          method: 'GET',
          headers: headers,
          url: `${process.env.SEC_TESTER_TARGET}/api/auth/jwt/${jwtType}/validate`
        }));
    });
  });
});
