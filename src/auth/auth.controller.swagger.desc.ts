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
    Authenticates user and returns JWT token with HCA256. The key is configurable on server via JWT_SECRET_KEY env variable.
`;

export const SWAGGER_DESC_validateWithJKUJwt = `
    Vurenability case: Uses publicly available JSON to check if JWT is properly signed after the Header in JWT is set to point to our JSON and sign the JWT with our private key.
`;

export const SWAGGER_DESC_loginWithJWKJwt = `
    Authenticates user and returns JWT token with HCA256. The key is configurable on server via JWT_SECRET_KEY env variable.
`;

export const SWAGGER_DESC_validateWithJWKJwt = `
    Vurenability case: JWK field JSON in Header has empty values and our private key to sign the JWT
`;

export const SWAGGER_DESC_loginWithX5CJwt = `
    Authenticates user and returns JWT token with HCA256. The key is configurable on server via JWT_SECRET_KEY env variable.
`;

export const SWAGGER_DESC_validateWithX5CJwt = `
    Vurenability case: The application doesn’t properly check which X5C key is used for signing and when X5C headers are set to our values and signed with our private key, authentication is bypassed.
`;

export const SWAGGER_DESC_loginWithX5UJwt = `
    Authenticates user and returns JWT token with HCA256. The key is configurable on server via JWT_SECRET_KEY env variable.
`;

export const SWAGGER_DESC_validateWithX5UJwt = `
    Vurenability case: Uses the uploaded certificate to sign the JWT and sets the X5U Header in JWT to point to the uploaded certificate.
`;
