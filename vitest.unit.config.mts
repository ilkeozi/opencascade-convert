import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      all: true,
      include: ['src/**/*.ts'],
      reporter: ['text-summary', 'lcov'],
    },
  },
});
