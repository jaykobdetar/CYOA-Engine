import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/ts/**/*.ts'],
      exclude: ['src/ts/**/main.ts', 'src/ts/types/**']
    }
  },
  resolve: {
    alias: {
      '@': '/src/ts'
    }
  }
});
