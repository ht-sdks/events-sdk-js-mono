import type { Destination } from './destination'

export type DestinationSettings = Record<string, unknown>

export type DestinationFactory<TSettings extends DestinationSettings> = (
  settings: TSettings
) => Destination
