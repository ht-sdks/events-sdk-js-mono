const js = require('@eslint/js')
const tseslint = require('typescript-eslint')
const prettier = require('eslint-plugin-prettier/recommended')
const jestPlugin = require('eslint-plugin-jest')
const importX = require('eslint-plugin-import-x')
const globals = require('globals')

const isomorphicSrcFiles = ['packages/core/src/**', 'packages/node/src/**']
const isomorphicSrcIgnored = ['**/__tests__/**']

module.exports = tseslint.config(
  {
    linterOptions: {
      // Unused eslint-disable comments were silent on ESLint 8
      reportUnusedDisableDirectives: 'off',
    },
  },
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'packages/browser/e2e-tests/**',
      'packages/browser/qa/**',
      'packages/browser/*.tmp.*/**',
    ],
  },
  js.configs.recommended,
  {
    rules: {
      // New in ESLint 10 recommended; keep previous ESLint 8/9 behavior
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      ...tseslint.configs.recommended,
      prettier,
      jestPlugin.configs['flat/recommended'],
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
        ecmaVersion: 2020,
      },
    },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      // Replaces no-empty-interface / ban-types from typescript-eslint v5
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-wrapper-object-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      // New in typescript-eslint v8 recommended; keep previous v5 behavior
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unsafe-declaration-merging': 'off',
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          ignoreVoid: true,
        },
      ],
      'require-await': 'off',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/no-empty-function': 'off',
      /** jest */
      'jest/valid-title': 'off', // allow functions to be used as describe titles
      'jest/no-conditional-expect': 'off', // best practice, but TODO
      'jest/no-alias-methods': 'off', // best practice, but TODO
      'jest/expect-expect': 'off', // sometimes we compose assertion functions
      'jest/no-disabled-tests': 'off',
      'jest/no-focused-tests': process.env.CI ? 'error' : 'off',
    },
  },
  {
    files: ['**/__tests__/**', '**/scripts/**'],
    rules: {
      'require-await': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [prettier],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['packages/browser/**'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['packages/consent/**'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    files: ['packages/test-helpers/**'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: isomorphicSrcFiles,
    ignores: isomorphicSrcIgnored,
    plugins: {
      'import-x': importX,
    },
    rules: {
      'no-restricted-globals': [
        'error',
        'document',
        'window',
        'self',
        'process',
        'global',
        'navigator',
        'location',
      ],
      'import-x/no-nodejs-modules': 'error',
    },
  }
)
