import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    testTimeout: 15000,
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1
  }
});
