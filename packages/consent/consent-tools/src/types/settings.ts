import { LoadContext } from '../domain/load-cancellation'
import type {
  Categories,
  IntegrationCategoryMappings,
  CDNSettingsRemotePlugin,
} from './wrapper'

export type RegisterOnConsentChangedFunction = (
  categoriesChangedCb: (categories: Categories) => void
) => void

/**
 * Consent wrapper function configuration
 */
export interface CreateWrapperSettings {
  /**
   * Wait until this function resolves/returns before loading analytics.
   * This function should return a list of initial categories.
   * If this function returns `undefined`, `getCategories()` function will be called to get initial categories.
   **/
  shouldLoad?: (
    context: LoadContext
  ) => Categories | void | Promise<Categories | void>

  /**
   * Fetch the categories which stamp every event. Called each time a new Hightouch event is dispatched.
   * @example
   * ```ts
   * () => ({ "Advertising": true, "Analytics": false })
   * ```
   **/
  getCategories: () => Categories | Promise<Categories>

  /**
   * Function to register a listener for consent changes to programatically send a "Hightouch Consent Preference" event to Hightouch when consent preferences change.
   *
   * #### Note: The callback requires the categories to be in the shape of { "C0001": true, "C0002": false }, so some normalization may be needed.
   * @example
   * ```ts
   * async (categoriesChangedCb) => {
   *   await resolveWhen(() => window.MyCMP !== undefined, 500)
   *   window.MyCMP.OnConsentChanged((event.detail) => categoriesChangedCb(normalizeCategories(event.detail))
   * }
   *
   * /* event payload
   * {
   *  "type": "track",
   *  "event": "Hightouch Consent Preference",
   *  "context": {
   *    "consent": {
   *      "version": 2,
   *      "categoryPreferences" : {
   *         "C0001": true,
   *         "C0002": false,
   *    }
   *  }
   * ..
   * ```
   */
  registerOnConsentChanged?: RegisterOnConsentChangedFunction

  /**
   * This permanently disables any consent requirement (i.e device mode gating, event pref stamping).
   * Called on wrapper initialization. **shouldLoad will never be called**
   **/
  shouldDisableConsentRequirement?: () => boolean | Promise<boolean>

  /**
   * Disable the HtEvents SDK completely. htevents.load() will have no effect.
   * .track / .identify etc calls should not throw any errors, but analytics settings will never be fetched and no events will be sent to Hightouch.
   * Called on wrapper initialization. This can be useful in dev environments (e.g. 'devMode').
   * **shouldLoad will never be called**
   **/
  shouldDisableHightouch?: () => boolean | Promise<boolean>

  /**
   * Object that maps `integrationName -> categories`. Typically, this is not needed, as this data comes from the CDN and is attached to each integration.
   * However, it may be desirable to hardcode these mappings (e.g, for testing).
   * @example
   * {"Braze Web Mode (Actions)": ["Advertising", "Analytics"]
   */
  integrationCategoryMappings?: IntegrationCategoryMappings

  /**
   * Predicate function to override default logic around whether or not to load an integration. By default, consent requires a user to have all categories enabled for a given integration.
   * @example
   * ```ts
   * // Always disable a particular plugin
   * const shouldEnableIntegration = (integrationCategories, categories, { creationName }) => {
   *    if (creationName === 'FullStory') return false
   *    if (!integrationCategories.length) return true
   *    return integrationCategories.every((c) => categories[c])
   * }
   * ```
   */
  shouldEnableIntegration?: (
    integrationCategories: string[],
    categories: Categories,
    integrationInfo: Pick<CDNSettingsRemotePlugin, 'creationName'>
  ) => boolean

  /**
   * Prune consent categories from the `context.consent.categoryPreferences` payload if that category is not mapped to any integration in your Hightouch.io source.
   * This is helpful if you want to save on bytes sent to Hightouch and do need the complete list of CMP's categories for debugging or other reasons.
   * By default, all consent categories returned by `getCategories()` are sent to Hightouch.
   * @default false
   * ### Example Behavior
   * You have the following categories mappings defined:
   * ```
   * FullStory -> 'CAT002',
   * Braze -> 'CAT003'
   * ```
   * ```ts
   * // pruneUnmappedCategories = false (default)
   * { CAT0001: true, CAT0002: true, CAT0003: true }
   * // pruneUnmappedCategories = true
   * { CAT0002: true, CAT0003: true  } // pruneUnmappedCategories = true
   * ```
   */
  pruneUnmappedCategories?: boolean
}
