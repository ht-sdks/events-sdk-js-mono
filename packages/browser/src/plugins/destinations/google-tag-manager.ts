import type { Context } from '../../core/context'
import type { DestinationFactory } from './types'
import { Destination } from './destination'

declare global {
  interface Window {
    gtag: Function
  }
}

type GoogleTagManagerSettings = {
  /**
   * The Google measurement ID(s) to send events to (GA4, Ads)
   */
  measurementId?: string | string[]

  /**
   * If a `Viewed Page` event should be sent for all `htevents.page` calls
   */
  trackAllPages?: boolean

  /**
   * If a `Viewed <name> Page` event should be sent for `htevents.page('Name')` calls
   */
  trackNamedPages?: boolean

  /**
   * If a `Viewed <category> <name> Page` event should be sent for `htevents.page('Category', 'Name')` calls
   */
  trackCategorizedPages?: boolean
}

/**
 * https://github.com/segmentio/analytics.js-integrations/blob/master/integrations/google-tag-manager/lib/index.js
 */
const googleTagManager: DestinationFactory<GoogleTagManagerSettings> = ({
  measurementId = [],
  trackAllPages = false,
  trackNamedPages = true,
  trackCategorizedPages = true,
}) => {
  const measurementIds = (
    Array.isArray(measurementId) ? measurementId : [measurementId]
  ).filter(Boolean)

  const baseEvent = ({ event }: Context) => {
    return {
      ...(event.userId && {
        user_id: event.userId,
      }),
      ...(event.anonymousId && {
        hightouch_anonymous_id: event.anonymousId,
      }),
      ...(measurementIds.length > 0 && {
        send_to: measurementIds,
      }),
      ...event.properties,
    }
  }

  return new Destination('Google Tag Manager', '0.0.1', {
    identify: (ctx) => {
      if (ctx.event.userId) {
        measurementIds.forEach((measurementId) => {
          window.gtag('config', measurementId, {
            user_id: ctx.event.userId,
          })
        })
      }
    },

    page: (ctx) => {
      if (
        trackAllPages ||
        (trackNamedPages && ctx.event.name) ||
        (trackCategorizedPages && ctx.event.category)
      ) {
        const eventName = ['Viewed', ctx.event.category, ctx.event.name, 'Page']
          .filter(Boolean)
          .join(' ')

        window.gtag('event', eventName, {
          ...baseEvent(ctx),
        })
      }
    },

    track: (ctx) => {
      window.gtag('event', ctx.event.event, {
        ...baseEvent(ctx),
      })
    },
  })
}

export default googleTagManager
