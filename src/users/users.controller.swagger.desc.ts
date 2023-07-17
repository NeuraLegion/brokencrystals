export const SWAGGER_DESC_OPTIONS_REQUEST = `List of permitted communication options`;

export const SWAGGER_DESC_FIND_USER = `Returns user info by email`;

export const SWAGGER_DESC_FIND_FULL_USER_INFO = `Returns full user info by email`;

export const SWAGGER_DESC_FIND_USERS = `Returns users info contains searched substring in firstName`;

export const SWAGGER_DESC_PHOTO_USER_BY_EMAIL = `Returns user profile photo`;

export const SWAGGER_DESC_DELETE_PHOTO_USER_BY_ID = `Deletes user profile photo by user's ID`;

export const SWAGGER_DESC_LDAP_SEARCH = `Performs LDAP search for user details`;

export const SWAGGER_DESC_CREATE_BASIC_USER = `Creates BASIC user in PostGreSQL db`;

export const SWAGGER_DESC_CREATE_OIDC_USER = `Creates OIDC user in KeyCloak db`;

export const SWAGGER_DESC_UPLOAD_USER_PHOTO = `Uploads user profile photo`;

export const SWAGGER_DESC_UPDATE_USER_INFO = `Method for updating user details. Vulnerability case: Mass Assignment allows an attacker to modify object properties, which are not supposed to be changed by the user`;

export const SWAGGER_DESC_ADMIN_RIGHTS = `Endpoint for checking admin rights of authenticated user`;
