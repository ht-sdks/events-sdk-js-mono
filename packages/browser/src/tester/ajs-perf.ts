import { setup, teardown } from 'jest-dev-server'
import type { SpawndChildProcess } from 'spawnd'

let servers: SpawndChildProcess[] = []

export async function globalSetup(): Promise<void> {
  servers = await setup({
    command: `node src/tester/server.js --port=3001`,
    launchTimeout: 5000,
    port: 3001,
  })
}

export async function globalTeardown(): Promise<void> {
  await teardown(servers)
}
