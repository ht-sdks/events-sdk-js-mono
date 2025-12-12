import type { Context } from '../../core/context'
import type { Plugin } from '../../core/plugin'
import { PluginType } from '@ht-sdks/events-sdk-js-core'
import { Analytics } from '../../core/analytics'
import { loadScript } from '../../lib/load-script'
import { isServer } from '../../core/environment'

// Facebook Parameter Builder SDK types (clientParamBuilder)
// Based on Meta's official API: https://developers.facebook.com/docs/marketing-api/conversions-api/parameter-builder-feature-library/client-side-onboarding
interface ClientParamBuilder {
  /**
   * Processes and collects all parameters (fbc, fbp, client_ip_address).
   * Must be called before getFbc(), getFbp(), or getClientIpAddress().
   * @param url - Optional. The full URL to collect clickID from. If not provided, uses window.location.href
   * @param getIpFn - Optional. Function to retrieve client IPv6 address (fallback to IPv4 if unavailable)
   * @returns Promise that resolves to updated cookie object with _fbc, _fbp, and _fbi keys
   */
  processAndCollectAllParams(
    url?: string,
    getIpFn?: () => Promise<string>
  ): Promise<{ _fbc?: string; _fbp?: string; _fbi?: string }>
  /**
   * Returns the fbc value from cookie. Returns empty string if cookie does not exist.
   */
  getFbc(): string
  /**
   * Returns the fbp value from cookie. Returns empty string if cookie does not exist.
   */
  getFbp(): string
  /**
   * Returns the client_ip_address value from cookie. Returns empty string if cookie does not exist.
   */
  getClientIpAddress(): string
}

export interface FacebookParamsSettings {
  /**
   * Custom URL for the Facebook Parameter Builder SDK (clientParamBuilder).
   * If not provided, defaults to Meta's official S3-hosted bundle.
   */
  sdkUrl?: string
}

// Yes, the official Meta docs say to use this S3 URL.
const DEFAULT_SDK_URL =
  'https://capi-automation.s3.us-east-2.amazonaws.com/public/client_js/capiParamBuilder/clientParamBuilder.bundle.js'

class FacebookParamsPlugin implements Plugin {
  private clientParamBuilder: ClientParamBuilder | null = null
  private sdkReady = false
  private sdkUrl: string

  name = 'Facebook Parameters'
  type: PluginType = 'enrichment'
  version = '0.1.0'

  constructor(settings?: FacebookParamsSettings) {
    this.sdkUrl = settings?.sdkUrl ?? DEFAULT_SDK_URL
  }

  isLoaded = () => this.sdkReady

  load = async (_ctx: Context, _instance: Analytics): Promise<void> => {
    if (isServer()) {
      // Server-side rendering - skip loading
      return Promise.resolve()
    }

    try {
      // Load Facebook Parameter Builder SDK
      await loadScript(this.sdkUrl)

      // The SDK is exposed as clientParamBuilder on window
      // Reference: https://developers.facebook.com/docs/marketing-api/conversions-api/parameter-builder-feature-library/client-side-onboarding
      const clientParamBuilder = (window as any).clientParamBuilder

      if (
        clientParamBuilder &&
        typeof clientParamBuilder.processAndCollectAllParams === 'function' &&
        typeof clientParamBuilder.getFbc === 'function' &&
        typeof clientParamBuilder.getFbp === 'function'
      ) {
        this.clientParamBuilder = clientParamBuilder as ClientParamBuilder

        // Call processAndCollectAllParams() first as required by Meta's API
        // This processes the URL, extracts fbclid if present, and saves cookies
        // We don't provide getIpFn since we're only interested in fbc/fbp, not client_ip_address
        await this.clientParamBuilder.processAndCollectAllParams()

        this.sdkReady = true
      } else {
        // SDK loaded but doesn't have expected interface
        console.warn(
          'Facebook Parameter Builder SDK loaded but clientParamBuilder is not available or does not expose expected interface'
        )
      }
    } catch (error) {
      // Graceful degradation - plugin will simply not enrich events
      console.warn('Failed to load Facebook Parameter Builder SDK:', error)
    }
  }

  private enrich = (ctx: Context): Context => {
    if (!this.sdkReady || !this.clientParamBuilder) {
      return ctx
    }

    try {
      const evtCtx = ctx.event.context
      // TODO test adding to properties instead?
      // const evtProps = ctx.event.properties
      if (!evtCtx) {
        return ctx
      }

      // Get fbc and fbp from cookies (processAndCollectAllParams was called during load)
      const fbc = this.clientParamBuilder.getFbc()
      const fbp = this.clientParamBuilder.getFbp()

      // Only add if not empty (getFbc/getFbp return empty string if cookie doesn't exist)
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

/**
 * Default plugin instance (uses default SDK URL from Meta's official S3 bucket).
 * Used when plugin is loaded via string name: plugins: ["facebook-params"]
 */
export const facebookParams = new FacebookParamsPlugin()

/**
 * Factory function to create a FacebookParamsPlugin with custom settings.
 * Used with PluginFactory pattern to allow custom SDK URLs.
 *
 * @example
 * ```javascript
 * const factory = (settings) => createFacebookParamsPlugin(settings);
 * factory.pluginName = 'facebook-params';
 * htevents.load("KEY", { plugins: [factory] });
 * ```
 */
export function createFacebookParamsPlugin(
  settings?: FacebookParamsSettings
): Plugin {
  return new FacebookParamsPlugin(settings)
}

