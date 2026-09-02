const fetcher = jest.fn()

import { Analytics } from '../../../core/analytics'
import { AnalyticsNode } from '../../..'

const myDate = new Date('2016')
const _Date = Date

describe('Analytics Node', () => {
  let ajs: Analytics
  const originalFetch = globalThis.fetch

  beforeEach(async () => {
    jest.resetAllMocks()
    fetcher.mockResolvedValue({ ok: true })
    globalThis.fetch = fetcher as typeof fetch

    const [analytics] = await AnalyticsNode.load({
      writeKey: 'abc123',
    })

    ajs = analytics

    // @ts-ignore
    global.Date = jest.fn(() => myDate)
    /* eslint-disable @typescript-eslint/unbound-method */
    global.Date.UTC = _Date.UTC
    global.Date.parse = _Date.parse
    global.Date.now = _Date.now
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe('AJS', () => {
    test('fireEvent instantiates the right event types', async () => {
      await ajs.track('track')
      expect(fetcher).toHaveBeenCalledWith(
        'https://us-east-1.hightouch-events.com/v1/track',
        expect.anything()
      )

      await ajs.identify('identify')
      expect(fetcher).toHaveBeenCalledWith(
        'https://us-east-1.hightouch-events.com/v1/identify',
        expect.anything()
      )

      await ajs.page('page')
      expect(fetcher).toHaveBeenCalledWith(
        'https://us-east-1.hightouch-events.com/v1/page',
        expect.anything()
      )

      await ajs.group('group')
      expect(fetcher).toHaveBeenCalledWith(
        'https://us-east-1.hightouch-events.com/v1/group',
        expect.anything()
      )

      await ajs.alias('alias')
      expect(fetcher).toHaveBeenCalledWith(
        'https://us-east-1.hightouch-events.com/v1/alias',
        expect.anything()
      )

      await ajs.screen('screen')
      expect(fetcher).toHaveBeenCalledWith(
        'https://us-east-1.hightouch-events.com/v1/screen',
        expect.anything()
      )
    })
  })
})
