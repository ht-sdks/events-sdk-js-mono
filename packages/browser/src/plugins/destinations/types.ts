import type { JSONObject } from '@ht-sdks/events-sdk-js-core'
import type { Destination } from './destination'

export type DestinationSettings = JSONObject

export type DestinationFactory<TSettings extends DestinationSettings> = (
  settings: TSettings
) => Destination
