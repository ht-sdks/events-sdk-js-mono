import { AnalyticsNode } from '../..'

const writeKey = 'foo'

describe('Initialization', () => {
  it('loads events-sdk-js-node plugin', async () => {
    const [analytics] = await AnalyticsNode.load({
      writeKey,
    })

    expect(analytics.queue.plugins.length).toBe(2)

    const ajsNodeXt = analytics.queue.plugins.find(
      (xt) => xt.name === 'events-sdk-js-node'
    )
    expect(ajsNodeXt).toBeDefined()
    expect(ajsNodeXt?.isLoaded()).toBeTruthy()
  })
})
