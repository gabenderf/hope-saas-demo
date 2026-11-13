import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  // supabase/functions roda em Deno, no servidor: outro ambiente, fora do lint do front.
  globalIgnores(['dist', 'coverage', 'node_modules', 'src/features/forecast/engine/**', 'scripts/**', 'public/**', 'supabase/functions/**']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended, reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Proibido: abre espaço para XSS. Renderize como texto.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@supabase/supabase-js',
              message: 'Use getSupabase() de @/lib/supabase, e só em src/auth, src/data/supabase ou features/*/data.',
            },
          ],
          patterns: [
            {
              group: ['@/lib/supabase'],
              message: 'Tela não fala com o banco. Use os hooks de @/data/hooks (ou a pasta data/ da sua feature).',
            },
          ],
        },
      ],
    },
  },
  {
    // Quem PODE falar com o Supabase.
    files: ['src/lib/supabase.ts', 'src/auth/**', 'src/data/supabase/**', 'src/features/*/data/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'src/test/**'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
]);
