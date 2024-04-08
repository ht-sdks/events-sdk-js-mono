import { HightouchEvent } from '../../core/events'
import { ActionDestination } from '../remote-loader'
import type { DestinationPluginFactory } from './types'

declare global {
  interface Window {
    gtag: Function
  }
}

type GoogleTagManagerSettings = {
  measurementId: string | string[]
  trackAllPages?: boolean
  trackNamedPages?: boolean
  trackCategorizedPages?: boolean
}

const googleTagManager: DestinationPluginFactory<GoogleTagManagerSettings> = ({
  measurementId,
  trackAllPages = false,
  trackNamedPages = false,
  trackCategorizedPages = false,
}) => {
  const measurementIds = Array.isArray(measurementId)
    ? measurementId
    : [measurementId]

  const baseEvent = (event: HightouchEvent) => {
    return {
      ...(event.userId && {
        user_id: event.userId,
      }),
      ...(event.anonymousId && {
        hightouch_anonymous_id: event.anonymousId,
      }),
      ...(event.category && {
        category: event.category,
      }),
      ...(event.name && {
        name: event.name,
      }),
      ...event.properties,
      send_to: measurementIds,
    }
  }

  return new ActionDestination('Google Tag Manager', {
    name: 'Google Tag Manager',
    version: '0.0.1',
    type: 'destination',
    ready: () => Promise.resolve(),

    isLoaded: () => true,
    load: (_ctx, _instance, _config) => Promise.resolve(),
    unload: (_ctx, _instance) => Promise.resolve(),

    identify: (ctx) => {
      if (ctx.event.userId) {
        measurementIds.forEach((measurementId) => {
          window.gtag('config', measurementId, {
            user_id: ctx.event.userId,
          })
        })
      }

      return ctx
    },

    page: (ctx) => {
      if (
        trackAllPages ||
        (trackNamedPages && ctx.event.name) ||
        (trackCategorizedPages && ctx.event.category)
      ) {
        window.gtag('event', 'page_view', {
          ...baseEvent(ctx.event),
        })
      }

      return ctx
    },

    track: (ctx) => {
      window.gtag('event', ctx.event.event, {
        ...baseEvent(ctx.event),
      })

      return ctx
    },
  })
}

export default googleTagManager
