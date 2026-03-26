import { mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config.js';

export default mergeConfig(baseConfig, {
  test: {
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['tests/integration/**'],
  },
});
