import { Injectable } from '@nestjs/common';
import * as jwt from 'jwt-simple';

@Injectable()
export class AuthService {
    
    async validateToken(token: string) : Promise<boolean> {
        // jwt.decode('a','a', true, jwt.)
        
        return null;
    }


    async createToken(payload: unknown): Promise<string> {
        // jwt.encode()
        return null;
    }
}
