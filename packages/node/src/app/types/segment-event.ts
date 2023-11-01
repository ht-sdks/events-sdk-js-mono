import type { CoreHightouchEvent } from '@ht-sdks/events-sdk-js-core'

type HightouchEventType = 'track' | 'page' | 'identify' | 'alias' | 'screen'

export interface HightouchEvent extends CoreHightouchEvent {
  type: HightouchEventType
}
