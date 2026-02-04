import playwright from 'playwright'
import { setup, teardown } from 'jest-dev-server'
import type { SpawndChildProcess } from 'spawnd'

// @ts-ignore
import lighthouse from 'lighthouse/lighthouse-core'
// @ts-ignore
import reportGenerator from 'lighthouse/report/generator/report-generator'

let servers: SpawndChildProcess[] = []

export function gatherLighthouseMetrics(
  page: playwright.Page
): Promise<unknown> {
  return lighthouse(page.url(), {
    port: 9222,
    logLevel: 'error',
  }).then(({ lhr }: { lhr: unknown }) => {
    return JSON.parse(reportGenerator.generateReport(lhr, 'json') as string)
  })
}

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
