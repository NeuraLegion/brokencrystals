export class JwtHeader {
  alg: 'RS256' | 'HS256';
  jku?: string;
  jwk?: unknown;
  kid?: string;
  x5u?: string;
  x5c?: string[];
  x5t?: string;
  typ?: string;
  cty?: string;
  crit?: string;
}
