/**
 * Vitest is scoped to this package's own tests — the DSH checkout may live
 * inside this repo (dev layout) and must not be scanned.
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
