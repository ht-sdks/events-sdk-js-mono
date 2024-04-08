import type { JSONObject } from '@ht-sdks/events-sdk-js-core'
import type { DestinationPlugin } from '../../core/plugin'

export type DestinationPluginSettings = JSONObject

export type DestinationPluginFactory<
  TSettings extends DestinationPluginSettings
> = (settings: TSettings) => DestinationPlugin
