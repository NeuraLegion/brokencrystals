export const SWAGGER_DESC_loginWithRSAJwtKeys = `
    Authenticates user and returns JWT token with RSA256 protocol. The key is siigned with RSA private key.
`;

export const SWAGGER_DESC_loginWithKIDSqlJwt = `
    Authenticates user and returns JWT token with HCA256. The key id is provided in KID protocol.
`;

export const SWAGGER_DESC_validateWithKIDSqlJwt = `
    Validates the JWT header and return secret if the header is valid. Executes SQL query by concatentatin the KID value to the query. 
    In case of None algorithm ignores the signature.
`;
export const SWAGGER_DESC_loginWithWeakKeyJwt = `
    Authenticates user and returns JWT token with HCA256. The key is configurable on server via JWT_SECRET_KEY env variable.
`;
export const SWAGGER_DESC_validateWithWeakKeyJwt = `
    Validates the JWT header and return secret if the header is valid. The token validation is done using algorithm in header and key 
    that is configured in JWT_SECRET_KEY env variable. In case of None algorithm ignores the signature.
`;

export const SWAGGER_DESC_loginWithJKUJwt = `
`;

export const SWAGGER_DESC_validateWithJKUJwt = `
`;

export const SWAGGER_DESC_loginWithJWKJwt = `
`;

export const SWAGGER_DESC_validateWithJWKJwt = `
`;

export const SWAGGER_DESC_loginWithX5CJwt = `
`;

export const SWAGGER_DESC_validateWithX5CJwt = `
`;

export const SWAGGER_DESC_loginWithX5UJwt = `
`;

export const SWAGGER_DESC_validateWithX5UJwt = `
`;


