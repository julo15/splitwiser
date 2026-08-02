import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Honour the `_` prefix the codebase already uses to mark a binding as
      // deliberately unused (e.g. `const { isOnline: _isOnline } = useSync()`).
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      }],

      // Warn, not error — the remaining violations need structural changes
      // rather than local edits, and CI blocks on errors only.
      //
      // Fetch-on-mount (App.tsx) and reset-form-when-a-modal-opens
      // (SettleUpModal, AddItemModal, ParticipantSelector) both trip this.
      // Clearing them means either adopting a data-fetching library or
      // remounting the modals from their parents via `key`, which changes
      // every call site. Worth doing deliberately, not as lint cleanup.
      'react-hooks/set-state-in-effect': 'warn',

      // Affects Vite fast refresh during development only; no production
      // impact. The violations are context modules that export a provider
      // component alongside its hook (AuthContext/useAuth, etc.), plus the
      // app entry point, which is inherently not refreshable. Clearing them
      // means splitting each context into two files.
      'react-refresh/only-export-components': 'warn',
    },
  },
])
