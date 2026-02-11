import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const baseConfig = require('../jest.config.json');

export default {
  ...baseConfig,
  testRegex: '.e2e-spec.ts$',
  rootDir: '.',
  watchman: false
};
