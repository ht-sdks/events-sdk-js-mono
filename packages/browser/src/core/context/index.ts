import {
  CoreContext,
  ContextCancelation,
  ContextFailedDelivery,
  SerializedContext,
  CancelationOptions,
} from '@ht-sdks/events-sdk-js-core'
import { HightouchEvent } from '../events/interfaces'
import { Stats } from '../stats'

export class Context extends CoreContext<HightouchEvent> {
  static override system() {
    return new this({ type: 'track', event: 'system' })
  }
  constructor(event: HightouchEvent, id?: string) {
    super(event, id, new Stats())
  }
}

export { ContextCancelation }
export type { ContextFailedDelivery, SerializedContext, CancelationOptions }
