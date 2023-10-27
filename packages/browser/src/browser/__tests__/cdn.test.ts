import { AnalyticsBrowser, getGlobalAnalytics } from '../..'
import unfetch from 'unfetch'
import { createSuccess } from '../../test-helpers/factories'
import { setGlobalCDNUrl } from '../../lib/parse-cdn'

jest.mock('unfetch', () => {
  return jest.fn()
})

const writeKey = 'foo'

beforeEach(() => {
  setGlobalCDNUrl(undefined as any)
})

jest
  .mocked(unfetch)
  .mockImplementation(() => createSuccess({ integrations: {} }))

it('supports overriding the CDN', async () => {
  const mockCdn = 'https://cdn.foobar.com'

  await AnalyticsBrowser.load({
    writeKey,
    cdnURL: mockCdn,
  })
  // by default, cdn settings are NOT fetched from the server
  expect(unfetch).not.toBeCalledWith(expect.stringContaining(mockCdn))
})

it('should not use the default CDN if not overridden', async () => {
  await AnalyticsBrowser.load({
    writeKey,
  })
  // by default, cdn settings are NOT fetched from the server
  expect(unfetch).not.toBeCalledWith(
    expect.stringContaining('https://cdn.hightouch-events.com')
  )
})

it('if CDN is overridden, sets the overridden CDN global variable', async () => {
  const mockCdn = 'https://cdn.foo.com'

  ;(window as any).htevents = {}

  await AnalyticsBrowser.load({
    writeKey,
    cdnURL: mockCdn,
  })
  // despite by default not calling cdn for settings,
  // still can set the cdn setting via settings
  expect(getGlobalAnalytics()?._cdn).toBe(mockCdn)
})
