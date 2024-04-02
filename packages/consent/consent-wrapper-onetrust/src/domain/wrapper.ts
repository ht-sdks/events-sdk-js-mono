import {
  AnyAnalytics,
  createWrapper,
  CreateWrapperSettings,
  resolveWhen,
} from '@ht-sdks/events-sdk-js-consent-tools'

import {
  getNormalizedCategoriesFromGroupData,
  getNormalizedCategoriesFromGroupIds,
  getConsentedGroupIds,
  getOneTrustGlobal,
} from '../lib/onetrust-api'

export interface OneTrustSettings {
  integrationCategoryMappings?: CreateWrapperSettings['integrationCategoryMappings']
  disableConsentChangedEvent?: boolean
}

/**
 *
 * @param analyticsInstance - An analytics instance. Either `window.htevents`, or the instance returned by `new HtEventsBrowser()` or `HtEventsBrowser.load({...})`
 * @param settings - Optional settings for configuring your OneTrust wrapper
 */
export const withOneTrust = <Analytics extends AnyAnalytics>(
  analyticsInstance: Analytics,
  settings: OneTrustSettings = {}
): Analytics => {
  return createWrapper<Analytics>({
    shouldLoad: async () => {
      const oneTrust = await getOneTrust()
      await resolveWhen(
        () => getConsentedGroupIds().length > 0 && oneTrust.IsAlertBoxClosed()
      )
    },

    getCategories: () => {
      return getNormalizedCategoriesFromGroupData()
    },

    registerOnConsentChanged: settings.disableConsentChangedEvent
      ? undefined
      : async (setCategories) => {
          const oneTrust = await getOneTrust()
          oneTrust.OnConsentChanged((event) => {
            const categories = getNormalizedCategoriesFromGroupIds(event.detail)
            setCategories(categories)
          })
        },

    integrationCategoryMappings: settings.integrationCategoryMappings,
  })(analyticsInstance)
}

const getOneTrust = async () => {
  await resolveWhen(() => getOneTrustGlobal() != null)
  return getOneTrustGlobal()!
}
