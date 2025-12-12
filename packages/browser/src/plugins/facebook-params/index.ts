import type { Context } from '../../core/context'
import type { Plugin } from '../../core/plugin'
import { PluginType } from '@ht-sdks/events-sdk-js-core'
import { Analytics } from '../../core/analytics'
import { loadScript } from '../../lib/load-script'
import { isServer } from '../../core/environment'

// Facebook Parameter Builder SDK types
interface FacebookParameterBuilder {
  getFbc(): string | null
  getFbp(): string | null
}

class FacebookParamsPlugin implements Plugin {
  private fbSDK: FacebookParameterBuilder | null = null
  private sdkReady = false

  name = 'Facebook Parameters'
  type: PluginType = 'enrichment'
  version = '0.1.0'

  isLoaded = () => this.sdkReady

  load = async (_ctx: Context, _instance: Analytics): Promise<void> => {
    if (isServer()) {
      // Server-side rendering - skip loading
      return Promise.resolve()
    }

    try {
      // Load Facebook Parameter Builder SDK from CDN
      // Using jsdelivr CDN to serve the client_js file from GitHub
      await loadScript(
        'https://cdn.jsdelivr.net/gh/facebook/capi-param-builder@main/client_js/parameter_builder.js'
      )

      // The SDK should be available on window after loading
      // Check for common global names the SDK might use
      const fbSDK =
        (window as any).FacebookParameterBuilder ||
        (window as any).ParameterBuilder ||
        (window as any).fbParameterBuilder

      if (fbSDK && typeof fbSDK.getFbc === 'function' && typeof fbSDK.getFbp === 'function') {
        this.fbSDK = fbSDK as FacebookParameterBuilder
        this.sdkReady = true
      } else {
        // SDK loaded but doesn't have expected interface
        console.warn(
          'Facebook Parameter Builder SDK loaded but does not expose expected interface'
        )
      }
    } catch (error) {
      // Graceful degradation - plugin will simply not enrich events
      console.warn('Failed to load Facebook Parameter Builder SDK:', error)
    }
  }

  private enrich = (ctx: Context): Context => {
    if (!this.sdkReady || !this.fbSDK) {
      return ctx
    }

    try {
      const evtCtx = ctx.event.context
      if (!evtCtx) {
        return ctx
      }

      const fbc = this.fbSDK.getFbc()
      const fbp = this.fbSDK.getFbp()

      if (fbc) {
        evtCtx.fbc = fbc
      }

      if (fbp) {
        evtCtx.fbp = fbp
      }
    } catch (error) {
      // Silently fail - don't break event processing if SDK has issues
      console.warn('Error extracting Facebook parameters:', error)
    }

    return ctx
  }

  track = this.enrich
  identify = this.enrich
  page = this.enrich
  group = this.enrich
  alias = this.enrich
  screen = this.enrich
}

export const facebookParams = new FacebookParamsPlugin()

