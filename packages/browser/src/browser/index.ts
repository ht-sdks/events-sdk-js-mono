import { getProcessEnv } from '../lib/get-process-env'
import { getCDN, setGlobalCDNUrl } from '../lib/parse-cdn'

import { fetch } from '../lib/fetch'
import { Analytics, AnalyticsSettings, InitOptions } from '../core/analytics'
import { Context } from '../core/context'
import { HTTPCookieService } from '../core/http-cookies'
import { Plan } from '../core/events'
import { Plugin } from '../core/plugin'
import { MetricsOptions } from '../core/stats/remote-metrics'
import { mergedOptions } from '../lib/merged-options'
import { createDeferred } from '../lib/create-deferred'
import { envEnrichment } from '../plugins/env-enrichment'
import {
  PluginFactory,
  remoteLoader,
  RemotePlugin,
} from '../plugins/remote-loader'
import type { RoutingRule } from '../plugins/routing-middleware'
import { hightouchio, HightouchioSettings } from '../plugins/hightouchio'
import { validation } from '../plugins/validation'
import {
  AnalyticsBuffered,
  PreInitMethodCallBuffer,
  flushAnalyticsCallsInNewTask,
  flushAddSourceMiddleware,
  flushSetAnonymousID,
  flushOn,
} from '../core/buffer'
import { ClassicIntegrationSource } from '../plugins/ajs-destination/types'
import { attachInspector } from '../core/inspector'
import { setGlobalAnalyticsKey } from '../lib/global-analytics-helper'
import { createPlugin } from '../plugins/browser-destinations'

export interface LegacyIntegrationConfiguration {
  /* @deprecated - This does not indicate browser types anymore */
  type?: string

  versionSettings?: {
    version?: string
    override?: string
    componentTypes?: Array<'browser' | 'android' | 'ios' | 'server'>
  }

  bundlingStatus?: string

  /**
   * Consent settings for the integration
   */
  consentSettings?: {
    /**
     * Consent categories for the integration
     * @example ["Analytics", "Advertising", "CAT001"]
     */
    categories: string[]
  }

  // Hightouch.io specific
  retryQueue?: boolean

  // any extra unknown settings
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

export interface LegacySettings {
  integrations: {
    [name: string]: LegacyIntegrationConfiguration
  }

  middlewareSettings?: {
    routingRules: RoutingRule[]
  }

  enabledMiddleware?: Record<string, boolean>
  metrics?: MetricsOptions

  plan?: Plan

  legacyVideoPluginsEnabled?: boolean

  remotePlugins?: RemotePlugin[]

  /**
   * Top level consent settings
   */
  consentSettings?: {
    /**
     * All unique consent categories.
     * There can be categories in this array that are important for consent that are not included in any integration  (e.g. 2 cloud mode categories).
     * @example ["Analytics", "Advertising", "CAT001"]
     */
    allCategories: string[]
  }
}

export interface HtEventsBrowserSettings extends AnalyticsSettings {
  /**
   * The settings for the Hightouch Source.
   * If provided, `HtEventsBrowser` will not fetch remote settings
   * for the source.
   */
  cdnSettings?: LegacySettings & Record<string, unknown>
  /**
   * If provided, will override the default Hightouch CDN (https://cdn.hightouch-events.com) for this application.
   */
  cdnURL?: string
}

export function loadLegacySettings(
  writeKey: string,
  cdnURL?: string
): Promise<LegacySettings> {
  const baseUrl = cdnURL ?? getCDN()

  return fetch(`${baseUrl}/v1/projects/${writeKey}/settings`)
    .then((res) => {
      if (!res.ok) {
        return res.text().then((errorResponseMessage) => {
          throw new Error(errorResponseMessage)
        })
      }
      return res.json()
    })
    .catch((err) => {
      console.error(err.message)
      throw err
    })
}

function hasLegacyDestinations(settings: LegacySettings): boolean {
  return (
    getProcessEnv().NODE_ENV !== 'test' &&
    // just one integration means hightouchio
    Object.keys(settings.integrations).length > 1
  )
}

function hasTsubMiddleware(settings: LegacySettings): boolean {
  return (
    getProcessEnv().NODE_ENV !== 'test' &&
    (settings.middlewareSettings?.routingRules?.length ?? 0) > 0
  )
}

/**
 * With AJS classic, we allow users to call setAnonymousId before the library initialization.
 * This is important because some of the destinations will use the anonymousId during the initialization,
 * and if we set anonId afterwards, that wouldn’t impact the destination.
 *
 * Also Ensures events can be registered before library initialization.
 * This is important so users can register to 'initialize' and any events that may fire early during setup.
 */
function flushPreBuffer(
  analytics: Analytics,
  buffer: PreInitMethodCallBuffer
): void {
  flushSetAnonymousID(analytics, buffer)
  flushOn(analytics, buffer)
}

/**
 * Finish flushing buffer and cleanup.
 */
async function flushFinalBuffer(
  analytics: Analytics,
  buffer: PreInitMethodCallBuffer
): Promise<void> {
  // Call popSnippetWindowBuffer before each flush task since there may be
  // analytics calls during async function calls.
  await flushAddSourceMiddleware(analytics, buffer)
  flushAnalyticsCallsInNewTask(analytics, buffer)
  // Clear buffer, just in case analytics is loaded twice; we don't want to fire events off again.
  buffer.clear()
}

async function registerPlugins(
  writeKey: string,
  legacySettings: LegacySettings,
  analytics: Analytics,
  opts: InitOptions,
  options: InitOptions,
  pluginLikes: (Plugin | PluginFactory)[] = [],
  legacyIntegrationSources: ClassicIntegrationSource[]
): Promise<Context> {
  const plugins = pluginLikes?.filter(
    (pluginLike) => typeof pluginLike === 'object'
  ) as Plugin[]

  const pluginSources = pluginLikes?.filter(
    (pluginLike) =>
      typeof pluginLike === 'function' &&
      typeof pluginLike.pluginName === 'string'
  ) as PluginFactory[]

  const tsubMiddleware = hasTsubMiddleware(legacySettings)
    ? await import(
        /* webpackChunkName: "tsub-middleware" */ '../plugins/routing-middleware'
      ).then((mod) => {
        return mod.tsubMiddleware(
          legacySettings.middlewareSettings!.routingRules
        )
      })
    : undefined

  const legacyDestinations =
    hasLegacyDestinations(legacySettings) || legacyIntegrationSources.length > 0
      ? await import(
          /* webpackChunkName: "ajs-destination" */ '../plugins/ajs-destination'
        ).then((mod) => {
          return mod.ajsDestinations(
            writeKey,
            legacySettings,
            analytics.integrations,
            opts,
            tsubMiddleware,
            legacyIntegrationSources
          )
        })
      : []

  if (legacySettings.legacyVideoPluginsEnabled) {
    await import(
      /* webpackChunkName: "legacyVideos" */ '../plugins/legacy-video-plugins'
    ).then((mod) => {
      return mod.loadLegacyVideoPlugins(analytics)
    })
  }

  const schemaFilter = opts.plan?.track
    ? await import(
        /* webpackChunkName: "schemaFilter" */ '../plugins/schema-filter'
      ).then((mod) => {
        return mod.schemaFilter(opts.plan?.track, legacySettings)
      })
    : undefined

  const mergedSettings = mergedOptions(legacySettings, options)
  const remotePlugins = await remoteLoader(
    legacySettings,
    analytics.integrations,
    mergedSettings,
    options.obfuscate,
    tsubMiddleware,
    pluginSources
  ).catch(() => [])

  const toRegister = [
    validation,
    envEnrichment,
    ...plugins,
    ...legacyDestinations,
    ...remotePlugins,
  ]

  if (schemaFilter) {
    toRegister.push(schemaFilter)
  }

  const shouldIgnoreHightouchio =
    (opts.integrations?.All === false && !opts.integrations['Hightouch.io']) ||
    (opts.integrations && opts.integrations['Hightouch.io'] === false)

  if (!shouldIgnoreHightouchio) {
    toRegister.push(
      await hightouchio(
        analytics,
        mergedSettings['Hightouch.io'] as HightouchioSettings,
        legacySettings.integrations
      )
    )
  }

  // register browser destination plugins
  await Promise.allSettled(
    Object.entries(options.plugins ?? {}).map(async ([name, settings]) => {
      const plugin = await createPlugin(name, settings)
      if (plugin) {
        toRegister.push(plugin)
        console.log('successfully loaded plugin', name)
      } else {
        console.warn('failed to load plugin', name)
      }
    })
  )

  const ctx = await analytics.register(...toRegister)

  if (
    Object.entries(legacySettings.enabledMiddleware ?? {}).some(
      ([, enabled]) => enabled
    )
  ) {
    await import(
      /* webpackChunkName: "remoteMiddleware" */ '../plugins/remote-middleware'
    ).then(async ({ remoteMiddlewares }) => {
      const middleware = await remoteMiddlewares(
        ctx,
        legacySettings,
        options.obfuscate
      )
      const promises = middleware.map((mdw) =>
        analytics.addSourceMiddleware(mdw)
      )
      return Promise.all(promises)
    })
  }

  return ctx
}

const defaultHightouchIntegration: HightouchioSettings = {
  apiKey: 'WRITE_KEY',
  apiHost: 'us-east-1.hightouch-events.com',
  protocol: 'https',
  unbundledIntegrations: [],
  addBundledMetadata: false,
  maybeBundledConfigIds: {},
  deliveryStrategy: {
    strategy: 'batching',
    config: { timeout: 1000, size: 10 }, // 1 second or 10 items
  },
}

const defaultSettings: LegacySettings = {
  integrations: {},
  plan: {
    track: { __default: { enabled: true, integrations: {} } },
    identify: { __default: { enabled: true } },
    group: { __default: { enabled: true } },
  },
  enabledMiddleware: {},
  metrics: { sampleRate: 0.0 },
  legacyVideoPluginsEnabled: false,
  remotePlugins: [],
}

async function loadAnalytics(
  settings: HtEventsBrowserSettings,
  options: InitOptions = {},
  preInitBuffer: PreInitMethodCallBuffer
): Promise<[Analytics, Context]> {
  if (options.globalAnalyticsKey)
    setGlobalAnalyticsKey(options.globalAnalyticsKey)
  // this is an ugly side-effect, but it's for the benefits of the plugins that get their cdn via getCDN()
  if (settings.cdnURL) setGlobalCDNUrl(settings.cdnURL)

  let legacySettings
  if (settings.cdnSettings) {
    legacySettings = settings.cdnSettings
  } else {
    defaultSettings.integrations['Hightouch.io'] = {
      ...defaultHightouchIntegration,
      ...(settings.writeKey ? { apiKey: settings.writeKey } : {}),
      ...(options.apiHost ? { apiHost: options.apiHost } : {}),
      ...(options.protocol ? { protocol: options.protocol } : {}),
      // defaultHightouchIntegration defaults to 'batching'
      // allow the options override to turn it off
      ...(options.batching == false
        ? {
            deliveryStrategy: {
              strategy: 'standard',
            },
          }
        : {}),
    }
    legacySettings = defaultSettings
  }

  if (options.updateCDNSettings) {
    legacySettings = options.updateCDNSettings(legacySettings)
  }

  const retryQueue: boolean =
    legacySettings.integrations['Hightouch.io']?.retryQueue ?? true

  if (!options.disableClientPersistence && options.httpCookieServiceOptions) {
    options.httpCookieService = await HTTPCookieService.load(
      options.httpCookieServiceOptions
    )
  }

  const opts: InitOptions = { retryQueue, ...options }
  const analytics = new Analytics(settings, opts)

  attachInspector(analytics)

  const plugins = settings.plugins ?? []

  const classicIntegrations = settings.classicIntegrations ?? []

  // Uncomment to re-enable RemoteMetrics -- also see standalone.ts RemoteMetrics usage
  // Stats.initRemoteMetrics(legacySettings.metrics)

  // needs to be flushed before plugins are registered
  flushPreBuffer(analytics, preInitBuffer)

  const ctx = await registerPlugins(
    settings.writeKey,
    legacySettings,
    analytics,
    opts,
    options,
    plugins,
    classicIntegrations
  )

  const search = window.location.search ?? ''
  const hash = window.location.hash ?? ''

  const term = search.length ? search : hash.replace(/(?=#).*(?=\?)/, '')

  if (term.includes('ajs_')) {
    await analytics.queryString(term).catch(console.error)
  }

  analytics.initialized = true
  analytics.emit('initialize', settings, options)

  if (options.initialPageview) {
    analytics.page().catch(console.error)
  }

  await flushFinalBuffer(analytics, preInitBuffer)

  return [analytics, ctx]
}

/**
 * The public browser interface for Hightouch Events
 *
 * @example
 * ```ts
 *  export const htevents = new HtEventsBrowser()
 *  htevents.load({ writeKey: 'foo' })
 * ```
 * @link https://github.com/ht-sdks/events-sdk-js-mono/tree/master/packages/browser#readme
 */
export class HtEventsBrowser extends AnalyticsBuffered {
  private _resolveLoadStart: (
    settings: HtEventsBrowserSettings,
    options: InitOptions
  ) => void

  constructor() {
    const { promise: loadStart, resolve: resolveLoadStart } =
      createDeferred<Parameters<HtEventsBrowser['load']>>()

    super((buffer) =>
      loadStart.then(([settings, options]) =>
        loadAnalytics(settings, options, buffer)
      )
    )

    this._resolveLoadStart = (settings, options) =>
      resolveLoadStart([settings, options])
  }

  /**
   * Fully initialize an analytics instance, including:
   *
   * * Fetching settings from the CDN (by default).
   * * Fetching all remote destinations configured by the user (if applicable).
   * * Flushing buffered analytics events.
   * * Loading all middleware.
   *
   * Note:️  This method should only be called *once* in your application.
   *
   * @example
   * ```ts
   * export const analytics = new HtEventsBrowser()
   * analytics.load({ writeKey: 'foo' })
   * ```
   */
  load(
    settings: HtEventsBrowserSettings,
    options: InitOptions = {}
  ): HtEventsBrowser {
    this._resolveLoadStart(settings, options)
    return this
  }

  /**
   * Instantiates an object exposing Analytics methods.
   *
   * @example
   * ```ts
   * const ajs = HtEventsBrowser.load({ writeKey: '<YOUR_WRITE_KEY>' })
   *
   * ajs.track("foo")
   * ...
   * ```
   */
  static load(
    settings: HtEventsBrowserSettings,
    options: InitOptions = {}
  ): HtEventsBrowser {
    return new HtEventsBrowser().load(settings, options)
  }

  static standalone(
    writeKey: string,
    options?: InitOptions
  ): Promise<Analytics> {
    return HtEventsBrowser.load({ writeKey }, options).then((res) => res[0])
  }
}
