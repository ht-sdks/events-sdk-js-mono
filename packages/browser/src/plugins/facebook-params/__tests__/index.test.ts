import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { Context } from '../../../core/context'
import { Analytics } from '../../../core/analytics'

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

import { facebookParams } from '../index'

describe('FacebookParamsPlugin', () => {
  beforeEach(() => {
    // Reset plugin state
    ;(facebookParams as any).clientParamBuilder = null
    ;(facebookParams as any).sdkReady = false
    jest.clearAllMocks()
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
    mockSDK.processAndCollectAllParams.mockResolvedValue({
      _fbc: 'fb.1.1234567890.AbCdEf',
      _fbp: 'fb.1.1234567890.GhIjKl',
    })
    mockSDK.getFbc.mockReturnValue('fb.1.1234567890.AbCdEf')
    mockSDK.getFbp.mockReturnValue('fb.1.1234567890.GhIjKl')
    mockSDK.getClientIpAddress.mockReturnValue('')

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
  })

  it('should handle SDK load errors gracefully', async () => {
    mockSDK.processAndCollectAllParams.mockRejectedValue(
      new Error('Failed to load')
    )

    const ctx = Context.system()
    const analytics = new Analytics({ writeKey: 'test' })

    // Should not throw
    await expect(facebookParams.load(ctx, analytics)).resolves.not.toThrow()
    expect(facebookParams.isLoaded()).toBe(false)
  })

  it('should handle SDK load timeouts gracefully', async () => {
    jest.useFakeTimers()
    mockSDK.processAndCollectAllParams.mockImplementation(
      () => new Promise(() => {})
    )

    const ctx = Context.system()
    const analytics = new Analytics({ writeKey: 'test' })
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

    const loadPromise = facebookParams.load(ctx, analytics)
    jest.advanceTimersByTime(2000)
    await loadPromise

    expect(facebookParams.isLoaded()).toBe(false)
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to load Facebook Parameter Builder SDK:',
      expect.objectContaining({
        message: 'Facebook Parameter Builder SDK load timed out',
      })
    )

    warnSpy.mockRestore()
    jest.useRealTimers()
  })

  it('should handle SDK methods that return empty strings', async () => {
    mockSDK.processAndCollectAllParams.mockResolvedValue({})
    mockSDK.getFbc.mockReturnValue('')
    mockSDK.getFbp.mockReturnValue('')
    mockSDK.getClientIpAddress.mockReturnValue('')

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
  })
})
