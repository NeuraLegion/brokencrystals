import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { encode, decode, TAlgorithm } from 'jwt-simple';
import * as fs from 'fs';
import { AuthModuleConfigProperties } from './auth.module.config.properties';

@Injectable()
export class AuthService {
  private privateKey: string;
  private publicKey: string;

  constructor(private readonly configService: ConfigService) {
    this.privateKey = fs.readFileSync(
      configService.get<string>(
        AuthModuleConfigProperties.ENV_JWT_PRIVATE_KEY_LOCATION,
      ),
      'utf8',
    );
    this.publicKey = fs.readFileSync(
      configService.get<string>(
        AuthModuleConfigProperties.ENV_JWT_PUBLIC_KEY_LOCATION,
      ),
      'utf8',
    );
  }

  async validateToken(token: string): Promise<any> {
    const parts = token.split('.');
    console.log(Buffer.from(parts[0], 'base64').toString('ascii'));
    return decode(token, this.publicKey, false, 'RS256');
  }

  async createToken(payload: unknown): Promise<string> {
    const token = encode(payload, this.privateKey, 'RS256');
    return token;
  }
}
