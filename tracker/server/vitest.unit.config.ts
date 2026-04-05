import { mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config.js';

export default mergeConfig(baseConfig, {
  test: {
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['tests/integration/**'],
    env: {
      // Satisfy env validation at import time; unit tests never connect to the DB
      TRACKER_DATABASE_URL: 'postgresql://localhost:5432/tracker_unit_test',
      JWT_SECRET: 'unit-test-secret',
    },
  },
});
