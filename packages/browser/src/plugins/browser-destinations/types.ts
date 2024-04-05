import type { Plugin } from '../../core/plugin'

export type PluginFactory<TSettings extends Record<string, any>> = (
  settings: TSettings
) => Plugin
