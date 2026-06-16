import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { HtEventsBrowser } from '../../browser'
import { BUILT_IN_PLUGINS, type BuiltInPluginName } from '../built-in-plugins'
import { facebookParams } from '../facebook-params'
import { createPlugin } from '../index'

const mockSDK = {
  processAndCollectAllParams:
    jest.fn<() => Promise<{ _fbc?: string; _fbp?: string }>>(),
  getFbc: jest.fn<() => string>(),
  getFbp: jest.fn<() => string>(),
  getClientIpAddress: jest.fn<() => string>(),
}

jest.mock('meta-capi-param-builder-clientjs', () => ({
  __esModule: true,
  default: mockSDK,
}))

describe('createPlugin', () => {
  it.each(BUILT_IN_PLUGINS)('resolves %s', async (name) => {
    const plugin = await createPlugin(name)

    expect(plugin).toBeDefined()
  })

  it('returns the facebook-params singleton', async () => {
    const plugin = await createPlugin('facebook-params')

    expect(plugin).toBe(facebookParams)
  })

  it('returns undefined for unknown plugin names', async () => {
    const plugin = await createPlugin('unknown-plugin' as BuiltInPluginName)

    expect(plugin).toBeUndefined()
  })
})

describe('HtEventsBrowser', () => {
  beforeEach(() => {
    ;(facebookParams as any).clientParamBuilder = null
    ;(facebookParams as any).sdkReady = false
    jest.clearAllMocks()
  })

  it('loads built-in plugins specified by string name', async () => {
    mockSDK.processAndCollectAllParams.mockResolvedValue({
      _fbc: 'fb.1.1234567890.AbCdEf',
      _fbp: 'fb.1.1234567890.GhIjKl',
    })
    mockSDK.getFbc.mockReturnValue('fb.1.1234567890.AbCdEf')
    mockSDK.getFbp.mockReturnValue('fb.1.1234567890.GhIjKl')
    mockSDK.getClientIpAddress.mockReturnValue('')

    const analytics = await HtEventsBrowser.standalone('test-write-key', {
      plugins: ['facebook-params'],
    })

    const plugin = analytics.queue.plugins.find(
      (p) => p.name === 'Facebook Parameters'
    )
    expect(plugin).toBe(facebookParams)
    expect(plugin?.isLoaded()).toBe(true)
  })
})
