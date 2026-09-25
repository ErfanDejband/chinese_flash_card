import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// Layer boundaries (see docs/adr/0001 and README "Architecture"):
// domain/  pure TypeScript, no React, no persistence, no UI
// import/  PDF pipeline, no React, no UI
const noUiOrReact = [
  { group: ['react', 'react-dom', 'react-*', 'react/*'], message: 'This layer must stay framework-free.' },
  { group: ['@/features/*', '@/ui/*', '@/app/*', '@/hooks/*'], message: 'This layer must not depend on UI code.' },
]

export default defineConfig([
  globalIgnores(['dist', 'dev-dist', 'coverage', 'samples']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...noUiOrReact,
            { group: ['dexie', 'dexie-*', '@/data/*', '@/import/*', '@/lib/*'], message: 'domain/ must not depend on persistence, the PDF pipeline, or browser helpers.' },
            {
              group: ['../../*', '../data/*', '../import/*', '../features/*', '../ui/*', '../app/*', '../hooks/*', '../lib/*'],
              message: 'Relative imports must not leave domain/.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/import/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: noUiOrReact }],
    },
  },
])
