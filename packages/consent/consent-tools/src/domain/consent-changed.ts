import { AnyAnalytics, Categories } from '../types'
import { getInitializedAnalytics } from './get-initialized-analytics'
import { validateCategories } from './validation'

/**
 * Dispatch an event that looks like:
 * ```ts
 * {
 * "type": "track",
 *  "event": "Consent Updated",
 *  "properties": {
 *    "categoryPreferences": {
 *      "C0001": true,
 *      "C0002": false,
 *    }
 *  },
 *  "context": {
 *    "consent": {
 *      "categoryPreferences" : {
 *         "C0001": true,
 *         "C0002": false,
 *    }
 *  }
 * ...
 * ```
 */
export const sendConsentChangedEvent = (
  analytics: AnyAnalytics,
  categories: Categories
): void => {
  getInitializedAnalytics(analytics).track(
    'Consent Updated',
    {
      categoryPreferences: categories,
    },
    {
      consent: {
        categoryPreferences: categories,
      },
    }
  )
}

export const validateAndSendConsentChangedEvent = (
  analytics: AnyAnalytics,
  categories: Categories
) => {
  try {
    validateCategories(categories)
    sendConsentChangedEvent(analytics, categories)
  } catch (err) {
    // Not sure if there's a better way to handle this, but this makes testing a bit easier.
    console.error(err)
  }
}
