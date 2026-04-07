import * as jwt from 'jsonwebtoken';

export abstract class JwtTokenProcessor {
  abstract validateToken(token: string): Promise<unknown>;

  protected verifyToken(token: string, secretOrKey: string | Buffer, algorithms: string[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      jwt.verify(token, secretOrKey, { algorithms }, (err, decoded) => {
        if (err) {
          return reject(err);
        }
        resolve(decoded);
      });
    });
  }
}

export class JwtTokenWithRSAKeysProcessor extends JwtTokenProcessor {
  private publicKey: string;
  private privateKey: string;

  constructor(publicKey: string, privateKey: string) {
    super();
    this.publicKey = publicKey;
    this.privateKey = privateKey;
  }

  async validateToken(token: string): Promise<unknown> {
    return this.verifyToken(token, this.publicKey, ['RS256', 'RS384', 'RS512']);
  }

  async createToken(payload: object): Promise<string> {
    return jwt.sign(payload, this.privateKey, { algorithm: 'RS256' });
  }
}

// Similar implementations for other processors should enforce secure algorithms
// and prevent the use of 'none'. Each processor can specify its respective
// secure algorithm suite.