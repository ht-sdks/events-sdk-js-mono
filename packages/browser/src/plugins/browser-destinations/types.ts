import type { Plugin } from '../../core/plugin'

export type PluginSettings = Record<string, any>

export type PluginFactory<TSettings extends PluginSettings> = (
  settings: TSettings
) => Plugin
