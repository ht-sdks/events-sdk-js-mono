import type { CoreSegmentEvent } from '@ht-sdks/events-sdk-js-core'

type SegmentEventType = 'track' | 'page' | 'identify' | 'alias' | 'screen'

export interface SegmentEvent extends CoreSegmentEvent {
  type: SegmentEventType
}
