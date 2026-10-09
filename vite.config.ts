import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: '/crypto-lab-lfsr-forge/',
  test: { include: ['src/**/*.test.ts'] },
})
