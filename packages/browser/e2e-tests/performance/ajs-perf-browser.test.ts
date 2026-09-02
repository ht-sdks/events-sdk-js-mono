import { tester, testerTeardown } from '../../src/tester/ajs-tester'
import { globalSetup, globalTeardown } from '../../src/tester/ajs-perf'
import { TEST_WRITEKEY } from '../../src/test-helpers/test-writekeys'

describe('Performance', () => {
  beforeAll(async () => {
    await globalSetup()
  })

  afterAll(async () => {
    await globalTeardown()
    await testerTeardown()
  })

  it('loads ajs in a browser', async () => {
    const analyticsStub = await tester(
      TEST_WRITEKEY,
      'http://localhost:3001',
      'chromium',
      true
    )

    const ctx = await analyticsStub.track('hi', {
      test: 'prop',
    })

    expect(ctx.event.event).toEqual('hi')
    expect(ctx.event.properties).toEqual({
      test: 'prop',
    })

    await analyticsStub.browserPage.close()
  }, 10000)
})
