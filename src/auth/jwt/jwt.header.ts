export class JwtHeader {
  alg: 'HS256' | 'HS384' | 'HS512' | 'RS256' | 'none';
  jku?: string;
  jwk?: any;
  kid?: string;
  x5u?: string;
  x5c?: string[];
  x5t?: string;
  typ?: string;
  cty?: string;
  crit?: string;
}
