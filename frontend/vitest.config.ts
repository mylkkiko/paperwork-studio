import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    // the app calls relative /api on its own origin; in tests that origin is http://app.test
    environmentOptions: { jsdom: { url: 'http://app.test/' } },
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup/setup.ts'],
    env: { NEXT_PUBLIC_APP_ENV: 'test' },
    coverage: { provider: 'v8', include: ['src/**/*.{ts,tsx}'], exclude: ['src/app/**/layout.tsx', 'src/components/ui/**'] },
  },
});
