// This file was previously exposed from the public web root and contained
// sensitive environment-derived configuration. It has been intentionally
// stripped of secrets so it can no longer leak credentials via direct HTTP
// access to /config.js.
//
// Server-only configuration should live outside the publicly served directory.

module.exports = {
  development: {},
  test: {},
  production: {},
  email: null
};
