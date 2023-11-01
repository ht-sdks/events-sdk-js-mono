import { createTestAnalytics } from './test-helpers/create-test-analytics'

describe('Plugins', () => {
  describe('Initialize', () => {
    it('loads events-sdk-js-node plugin', async () => {
      const analytics = createTestAnalytics()
      await analytics.ready

      const ajsNodeXt = analytics['_queue'].plugins.find(
        (xt) => xt.name === 'Hightouch.io'
      )
      expect(ajsNodeXt).toBeDefined()
      expect(ajsNodeXt?.isLoaded()).toBeTruthy()
    })
  })
})
