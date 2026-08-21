import js from '@eslint/js';
import globals from 'globals';

/**
 * Three source areas with different globals:
 *  - lib/, scripts/, config: Node (ESM)
 *  - assets/js/: browser (ESM), minus the vendored MathJax/MiniSearch bundles
 *  - test/: Node plus the node:test runner
 *
 * Rules stay close to eslint:recommended; the point is catching real mistakes
 * (unused bindings, shadowed declarations, fallthrough) rather than style,
 * which is not enforced here.
 */
export default [
  {
    ignores: [
      '_site/**',
      'node_modules/**',
      'source/**',
      'assets/js/mathjax/**',
      'assets/js/vendor/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    files: ['lib/**/*.js', 'scripts/**/*.js', 'eleventy.config.js', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['assets/js/**/*.js'],
    languageOptions: { globals: { ...globals.browser, MathJax: 'readonly' } },
  },
  {
    files: ['test/**/*.js'],
    languageOptions: { globals: globals.node },
  },
];
