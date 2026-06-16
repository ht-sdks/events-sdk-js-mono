import type { Context } from '../../core/context'
import type { Plugin } from '../../core/plugin'
import { PluginType } from '@ht-sdks/events-sdk-js-core'
import { Analytics } from '../../core/analytics'
import { isServer } from '../../core/environment'
import type { ClientParamBuilder } from 'meta-capi-param-builder-clientjs'

const SDK_LOAD_TIMEOUT_MS = 2000
const SDK_LOAD_TIMEOUT_MESSAGE = 'Facebook Parameter Builder SDK load timed out'

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })

  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer)
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

    // Runs to completion on its own, even if the race below gives up waiting
    const init = (async () => {
      const paramBuilderModule = await import(
        /* webpackChunkName: "meta-param-builder" */ 'meta-capi-param-builder-clientjs'
      )
      const clientParamBuilder = (paramBuilderModule.default ??
        paramBuilderModule) as ClientParamBuilder

      if (
        !clientParamBuilder ||
        typeof clientParamBuilder.processAndCollectAllParams !== 'function' ||
        typeof clientParamBuilder.getFbc !== 'function' ||
        typeof clientParamBuilder.getFbp !== 'function'
      ) {
        console.warn(
          'Facebook Parameter Builder SDK loaded but clientParamBuilder is not available or does not expose expected interface'
        )
        return
      }

      await clientParamBuilder.processAndCollectAllParams()
      this.clientParamBuilder = clientParamBuilder
      this.sdkReady = true
    })().catch((error) => {
      console.warn('Failed to load Facebook Parameter Builder SDK:', error)
    })

    // Timeout only bounds how long the event queue waits — it doesn't cancel init
    await _instance.queue.criticalTasks.run(() =>
      withTimeout(init, SDK_LOAD_TIMEOUT_MS, SDK_LOAD_TIMEOUT_MESSAGE).catch(
        () => {}
      )
    )
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
