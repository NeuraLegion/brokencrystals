import { SecRunner, SecScan } from '@sectester/runner';
import { TestType } from '@sectester/scan';
import axios from 'axios';

const generateToken = async (jwtType) => {
  const { headers } = await axios.post(
    `${process.env.SEC_TESTER_TARGET}/api/auth/jwt/${jwtType}/login`,
    {
      user: 'admin',
      password: 'admin',
      op: 'basic',
    },
  );
  return headers.authorization;
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
    it('should contain secure implementation of JSON Web Token (JWT)', async () => {
      const jwtType = 'kid-sql';
      const token = await generateToken(jwtType);
      await runner
        .createScan({ tests: [TestType.JWT], name: `JWT ${jwtType}` })
        .timeout(3000000)
        .run({
          method: 'GET',
          headers: { authorization: token },
          url: `${process.env.SEC_TESTER_TARGET}/api/auth/jwt/${jwtType}/validate`,
        });
    });

    it('should contain secure implementation of JSON Web Token (JWT)', async () => {
      const jwtType = 'weak-key';
      const token = await generateToken(jwtType);
      await runner
        .createScan({ tests: [TestType.JWT], name: `JWT ${jwtType}` })
        .timeout(3000000)
        .run({
          method: 'GET',
          headers: { authorization: token },
          url: `${process.env.SEC_TESTER_TARGET}/api/auth/jwt/${jwtType}/validate`,
        });
    });

    it('should contain secure implementation of JSON Web Token (JWT)', async () => {
      const jwtType = 'jku';
      const token = await generateToken(jwtType);
      await runner
        .createScan({ tests: [TestType.JWT], name: `JWT ${jwtType}` })
        .timeout(3000000)
        .run({
          method: 'GET',
          headers: { authorization: token },
          url: `${process.env.SEC_TESTER_TARGET}/api/auth/jwt/${jwtType}/validate`,
        });
    });

    it('should contain secure implementation of JSON Web Token (JWT)', async () => {
      const jwtType = 'jwk';
      const token = await generateToken(jwtType);
      await runner
        .createScan({ tests: [TestType.JWT], name: `JWT ${jwtType}` })
        .timeout(3000000)
        .run({
          method: 'GET',
          headers: { authorization: token },
          url: `${process.env.SEC_TESTER_TARGET}/api/auth/jwt/${jwtType}/validate`,
        });
    });

    it('should contain secure implementation of JSON Web Token (JWT)', async () => {
      const jwtType = 'x5c';
      const token = await generateToken(jwtType);
      await runner
        .createScan({ tests: [TestType.JWT], name: `JWT ${jwtType}` })
        .timeout(3000000)
        .run({
          method: 'GET',
          headers: { authorization: token },
          url: `${process.env.SEC_TESTER_TARGET}/api/auth/jwt/${jwtType}/validate`,
        });
    });

    it('should contain secure implementation of JSON Web Token (JWT)', async () => {
      const jwtType = 'x5u';
      const token = await generateToken(jwtType);
      await runner
        .createScan({ tests: [TestType.JWT], name: `JWT ${jwtType}` })
        .timeout(3000000)
        .run({
          method: 'GET',
          headers: { authorization: token },
          url: `${process.env.SEC_TESTER_TARGET}/api/auth/jwt/${jwtType}/validate`,
        });
    });
  });
});
