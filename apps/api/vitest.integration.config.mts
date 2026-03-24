import { mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config.mts';

export default mergeConfig(baseConfig, {
  test: {
    include: ['tests/integration/**/*.test.ts'],
    exclude: ['tests/unit/**'],
    globalSetup: ['tests/support/setup-db.ts'],
    testTimeout: 30000,
  },
});
