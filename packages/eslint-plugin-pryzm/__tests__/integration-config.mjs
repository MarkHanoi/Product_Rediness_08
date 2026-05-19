// Standalone ESLint flat-config used by the CI step
// "Lint integration — pryzm/no-raf rejects packages/legacy-shim".
//
// This config is INTENTIONALLY isolated from the root `eslint.config.js`
// so that the rule fires against the legacy-shim fixture (root config
// disables `pryzm/no-raf` for that directory by design).

import tsParser from '@typescript-eslint/parser';
import pryzm from 'eslint-plugin-pryzm';

export default [
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    plugins: { pryzm },
    rules: {
      'pryzm/no-raf': 'error',
    },
  },
];
