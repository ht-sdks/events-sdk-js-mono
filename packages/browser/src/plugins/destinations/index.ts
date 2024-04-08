import type { DestinationSettings } from './types'
import type { Destination } from './destination'

export { Destination } from './destination'
export type { DestinationSettings } from './types'

export async function createDestination(
  name: string,
  settings: DestinationSettings
): Promise<Destination | undefined> {
  switch (name) {
    case 'Google Tag Manager':
      return import(
        /* webpackChunkName: "destinations/google-tag-manager" */ './google-tag-manager'
      ).then((mod) => mod.default(settings as any))
    default:
      return undefined
  }
}
