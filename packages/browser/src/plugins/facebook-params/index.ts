import type { Context } from '../../core/context'
import type { Plugin } from '../../core/plugin'
import { PluginType } from '@ht-sdks/events-sdk-js-core'
import { Analytics } from '../../core/analytics'
import { isServer } from '../../core/environment'
import type { ClientParamBuilder } from 'meta-capi-param-builder-clientjs'

const SDK_LOAD_TIMEOUT_MS = 2000

function sdkLoadTimeout(): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('Facebook Parameter Builder SDK load timed out'))
    }, SDK_LOAD_TIMEOUT_MS)
  })
}

class FacebookParamsPlugin implements Plugin {
  private clientParamBuilder: ClientParamBuilder | null = null
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

    // Mark this plugin as critical so events wait for it to load
    // This ensures fbc/fbp are included in events from the start
    await _instance.queue.criticalTasks.run(async () => {
      try {
        const paramBuilderModule = await Promise.race([
          import(
            /* webpackChunkName: "meta-param-builder" */ 'meta-capi-param-builder-clientjs'
          ),
          sdkLoadTimeout(),
        ])
        const clientParamBuilder = (paramBuilderModule.default ??
          paramBuilderModule) as ClientParamBuilder

        if (
          clientParamBuilder &&
          typeof clientParamBuilder.processAndCollectAllParams === 'function' &&
          typeof clientParamBuilder.getFbc === 'function' &&
          typeof clientParamBuilder.getFbp === 'function'
        ) {
          await Promise.race([
            clientParamBuilder.processAndCollectAllParams(),
            sdkLoadTimeout(),
          ])

          this.clientParamBuilder = clientParamBuilder
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
    })
  }

  private enrich = (ctx: Context): Context => {
    if (!this.sdkReady || !this.clientParamBuilder) {
      return ctx
    }

    try {
      const evtCtx = ctx.event.context
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
 * Default plugin instance using Meta's official ParamBuilder SDK.
 * Used when plugin is loaded via string name: plugins: ["facebook-params"]
 */
export const facebookParams = new FacebookParamsPlugin()
