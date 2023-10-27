import {
  CoreContext,
  ContextCancelation,
  ContextFailedDelivery,
  SerializedContext,
  CancelationOptions,
} from '@ht-sdks/events-sdk-js-core'
import { SegmentEvent } from '../events/interfaces'
import { Stats } from '../stats'

export class Context extends CoreContext<SegmentEvent> {
  static override system() {
    return new this({ type: 'track', event: 'system' })
  }
  constructor(event: SegmentEvent, id?: string) {
    super(event, id, new Stats())
  }
}

export { ContextCancelation }
export type { ContextFailedDelivery, SerializedContext, CancelationOptions }
