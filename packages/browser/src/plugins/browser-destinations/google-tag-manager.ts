import { ActionDestination } from '../remote-loader'
import type { PluginFactory } from './types'

declare global {
  interface Window {
    gtag: Function
  }
}

type GoogleTagManagerSettings = {
  measurementId: string | string[]
}

const googleTagManager: PluginFactory<GoogleTagManagerSettings> = (
  settings
) => {
  const measurementIds = Array.isArray(settings.measurementId)
    ? settings.measurementId
    : [settings.measurementId]

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
      const name = 'page_view'

      const payload = {
        send_to: measurementIds,
        ...(ctx.event.userId && {
          user_id: ctx.event.userId,
        }),
        ...(ctx.event.anonymousId && {
          hightouch_anonymous_id: ctx.event.anonymousId,
        }),
      }

      window.gtag('event', name, payload)

      return ctx
    },

    track: (ctx) => {
      const name = ctx.event.event

      const payload = {
        ...ctx.event.properties,
        ...(ctx.event.userId && {
          user_id: ctx.event.userId,
        }),
        ...(ctx.event.anonymousId && {
          hightouch_anonymous_id: ctx.event.anonymousId,
        }),
        send_to: measurementIds,
      }

      window.gtag('event', name, payload)

      return ctx
    },
  })
}

export default googleTagManager
