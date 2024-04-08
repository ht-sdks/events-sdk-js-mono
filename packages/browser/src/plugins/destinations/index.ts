import type { DestinationPluginSettings } from './types'
import type { DestinationPlugin } from '../../core/plugin'

export type { DestinationPluginSettings } from './types'

export async function createDestinationPlugin(
  name: string,
  settings: DestinationPluginSettings
): Promise<DestinationPlugin | undefined> {
  switch (name) {
    case 'Google Tag Manager':
      return import(
        /* webpackChunkName: "destinations/google-tag-manager" */ './google-tag-manager'
      ).then((mod) => mod.default(settings as any))
    default:
      return undefined
  }
}
