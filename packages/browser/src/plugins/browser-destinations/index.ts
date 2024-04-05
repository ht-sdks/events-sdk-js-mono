import type { PluginSettings } from './types'
import type { Plugin } from '../../core/plugin'

export type { PluginSettings } from './types'

export async function createPlugin(
  name: string,
  settings: PluginSettings
): Promise<Plugin | undefined> {
  switch (name) {
    case 'Google Tag Manager':
      return await import(
        /* webpackChunkName: "google-tag-manager" */ './google-tag-manager'
      ).then((mod) => {
        return mod.default(settings as any)
      })
    default:
      return undefined
  }
}
