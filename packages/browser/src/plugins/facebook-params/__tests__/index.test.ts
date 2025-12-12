import { facebookParams } from '../index'
import { Context } from '../../../core/context'
import { Analytics } from '../../../core/analytics'
import * as loadScriptModule from '../../../lib/load-script'

describe('FacebookParamsPlugin', () => {
  beforeEach(() => {
    // Reset plugin state
    ;(facebookParams as any).fbSDK = null
    ;(facebookParams as any).sdkReady = false
    // Clear window globals
    delete (window as any).FacebookParameterBuilder
    delete (window as any).ParameterBuilder
    delete (window as any).fbParameterBuilder
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
    // Mock the Facebook SDK
    const mockSDK = {
      getFbc: jest.fn(() => 'fb.1.1234567890.AbCdEf'),
      getFbp: jest.fn(() => 'fb.1.1234567890.GhIjKl'),
    }

    // Mock loadScript to succeed
    jest
      .spyOn(loadScriptModule, 'loadScript')
      .mockResolvedValue(document.createElement('script'))

    ;(window as any).FacebookParameterBuilder = mockSDK

    const ctx = Context.system()
    const analytics = new Analytics({ writeKey: 'test' })

    await facebookParams.load(ctx, analytics)

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

  it('should handle SDK methods that return null', async () => {
    const mockSDK = {
      getFbc: jest.fn(() => null),
      getFbp: jest.fn(() => null),
    }

    jest
      .spyOn(loadScriptModule, 'loadScript')
      .mockResolvedValue(document.createElement('script'))

    ;(window as any).FacebookParameterBuilder = mockSDK

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
    expect(enriched.event.context?.fbc).toBeUndefined()
    expect(enriched.event.context?.fbp).toBeUndefined()

    jest.restoreAllMocks()
  })
})

