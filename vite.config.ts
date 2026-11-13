/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { cabecalhosCloudflare } from './vite-headers';

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), cabecalhosCloudflare(loadEnv(mode, process.cwd(), 'VITE_').VITE_SUPABASE_URL)],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5180, strictPort: true },
  preview: { port: 5181, strictPort: true },
  // 'hidden': gera os .map (para ferramenta de erro), mas o bundle não aponta
  // para eles. Na hospedagem, NÃO publicar *.map (o código-fonte e os
  // comentários sairiam junto). Ver docs/seguranca.md.
  build: { target: 'es2022', sourcemap: 'hidden' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
}));
