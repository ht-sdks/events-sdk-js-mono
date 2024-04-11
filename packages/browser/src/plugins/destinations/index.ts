import type { DestinationSettings } from './types'
import { Destination } from './destination'

export { Destination }
export type { DestinationSettings }

export async function createDestination(
  name: string,
  settings: DestinationSettings
): Promise<Destination | undefined> {
  switch (name) {
    case 'Google Tag Manager':
      return import(
        /* webpackChunkName: "google-tag-manager" */ './google-tag-manager'
      ).then((mod) => mod.default(settings as any))
    default:
      return undefined
  }
}
