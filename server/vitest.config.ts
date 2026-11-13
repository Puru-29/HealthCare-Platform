import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    env: {
      DATABASE_PATH: ':memory:',
      ROUTING_MODE: 'off',
      DEMO_MODE: 'false',
      NOTIFY_MODE: 'console',
      NODE_ENV: 'test',
    },
  },
})
