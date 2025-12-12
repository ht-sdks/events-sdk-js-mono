import {
  facebookParams,
  createFacebookParamsPlugin,
} from '../index'
import { Context } from '../../../core/context'
import { Analytics } from '../../../core/analytics'
import * as loadScriptModule from '../../../lib/load-script'

describe('FacebookParamsPlugin', () => {
  beforeEach(() => {
    // Reset plugin state
    ;(facebookParams as any).clientParamBuilder = null
    ;(facebookParams as any).sdkReady = false
    // Clear window globals
    delete (window as any).clientParamBuilder
  })

  it('should have correct plugin metadata', () => {
    expect(facebookParams.name).toBe('Facebook Parameters')
    expect(facebookParams.type).toBe('enrichment')
    expect(facebookParams.version).toBe('0.1.0')
  })

  it('should not be loaded initially', () => {
    expect(facebookParams.isLoaded()).toBe(false)
  })

  it('should not enrich events when SDK is not loaded', () => {
    const ctx = Context.system()
    ctx.event = {
      type: 'track',
      event: 'test',
      properties: {},
      context: {},
    }

    const enriched = facebookParams.track(ctx)
    expect(enriched.event.context?.fbc).toBeUndefined()
    expect(enriched.event.context?.fbp).toBeUndefined()
  })

  it('should enrich events when SDK is loaded', async () => {
    // Mock the Facebook SDK (clientParamBuilder)
    const mockSDK = {
      processAndCollectAllParams: jest.fn().mockResolvedValue({
        _fbc: 'fb.1.1234567890.AbCdEf',
        _fbp: 'fb.1.1234567890.GhIjKl',
      }),
      getFbc: jest.fn(() => 'fb.1.1234567890.AbCdEf'),
      getFbp: jest.fn(() => 'fb.1.1234567890.GhIjKl'),
      getClientIpAddress: jest.fn(() => ''),
    }

    // Mock loadScript to succeed
    jest
      .spyOn(loadScriptModule, 'loadScript')
      .mockResolvedValue(document.createElement('script'))

    ;(window as any).clientParamBuilder = mockSDK

    const ctx = Context.system()
    const analytics = new Analytics({ writeKey: 'test' })

    await facebookParams.load(ctx, analytics)

    expect(mockSDK.processAndCollectAllParams).toHaveBeenCalled()
    expect(facebookParams.isLoaded()).toBe(true)

    ctx.event = {
      type: 'track',
      event: 'test',
      properties: {},
      context: {},
    }

    const enriched = facebookParams.track(ctx)
    expect(enriched.event.context?.fbc).toBe('fb.1.1234567890.AbCdEf')
    expect(enriched.event.context?.fbp).toBe('fb.1.1234567890.GhIjKl')

    jest.restoreAllMocks()
  })

  it('should handle SDK load errors gracefully', async () => {
    // Mock loadScript to fail
    jest
      .spyOn(loadScriptModule, 'loadScript')
      .mockRejectedValue(new Error('Failed to load'))

    const ctx = Context.system()
    const analytics = new Analytics({ writeKey: 'test' })

    // Should not throw
    await expect(facebookParams.load(ctx, analytics)).resolves.not.toThrow()
    expect(facebookParams.isLoaded()).toBe(false)

    jest.restoreAllMocks()
  })

  it('should handle SDK methods that return empty strings', async () => {
    const mockSDK = {
      processAndCollectAllParams: jest.fn().mockResolvedValue({}),
      getFbc: jest.fn(() => ''),
      getFbp: jest.fn(() => ''),
      getClientIpAddress: jest.fn(() => ''),
    }

    jest
      .spyOn(loadScriptModule, 'loadScript')
      .mockResolvedValue(document.createElement('script'))

    ;(window as any).clientParamBuilder = mockSDK

    const ctx = Context.system()
    const analytics = new Analytics({ writeKey: 'test' })

    await facebookParams.load(ctx, analytics)

    ctx.event = {
      type: 'track',
      event: 'test',
      properties: {},
      context: {},
    }

    const enriched = facebookParams.track(ctx)
    // Empty strings should not be added to context
    expect(enriched.event.context?.fbc).toBeUndefined()
    expect(enriched.event.context?.fbp).toBeUndefined()

    jest.restoreAllMocks()
  })

  describe('createFacebookParamsPlugin factory', () => {
    it('should create a plugin instance with default SDK URL', () => {
      const plugin = createFacebookParamsPlugin()
      expect(plugin.name).toBe('Facebook Parameters')
      expect(plugin.type).toBe('enrichment')
    })

    it('should create a plugin instance with custom SDK URL', async () => {
      const customSdkUrl = 'https://custom-cdn.example.com/parameter_builder.js'
      const plugin = createFacebookParamsPlugin({ sdkUrl: customSdkUrl })

      const loadScriptSpy = jest
        .spyOn(loadScriptModule, 'loadScript')
        .mockResolvedValue(document.createElement('script'))

      const mockSDK = {
        processAndCollectAllParams: jest.fn().mockResolvedValue({
          _fbc: 'fb.1.1234567890.AbCdEf',
          _fbp: 'fb.1.1234567890.GhIjKl',
        }),
        getFbc: jest.fn(() => 'fb.1.1234567890.AbCdEf'),
        getFbp: jest.fn(() => 'fb.1.1234567890.GhIjKl'),
        getClientIpAddress: jest.fn(() => ''),
      }
      ;(window as any).clientParamBuilder = mockSDK

      const ctx = Context.system()
      const analytics = new Analytics({ writeKey: 'test' })

      await plugin.load(ctx, analytics)

      expect(loadScriptSpy).toHaveBeenCalledWith(customSdkUrl)
      expect(plugin.isLoaded()).toBe(true)

      jest.restoreAllMocks()
    })

    it('should work as a PluginFactory', async () => {
      const factory = createFacebookParamsPlugin
      const plugin = factory({ sdkUrl: 'https://custom.example.com/sdk.js' })

      expect(plugin).toBeDefined()
      expect(plugin.name).toBe('Facebook Parameters')

      const loadScriptSpy = jest
        .spyOn(loadScriptModule, 'loadScript')
        .mockResolvedValue(document.createElement('script'))

      const mockSDK = {
        processAndCollectAllParams: jest.fn().mockResolvedValue({
          _fbc: 'fb.1.test',
          _fbp: 'fb.1.test',
        }),
        getFbc: jest.fn(() => 'fb.1.test'),
        getFbp: jest.fn(() => 'fb.1.test'),
        getClientIpAddress: jest.fn(() => ''),
      }
      ;(window as any).clientParamBuilder = mockSDK

      const ctx = Context.system()
      const analytics = new Analytics({ writeKey: 'test' })

      await plugin.load(ctx, analytics)

      expect(loadScriptSpy).toHaveBeenCalledWith('https://custom.example.com/sdk.js')

      jest.restoreAllMocks()
    })
  })
})

