import { EventFactory } from '@ht-sdks/events-sdk-js-core'
import { createMessageId } from '../lib/get-message-id'
import { HightouchEvent } from './types'

// use declaration merging to downcast CoreHightouchEvent without adding any runtime code.
// if/when we decide to add an actual implementation to NodeEventFactory that actually changes the event shape, we can remove this.
export interface NodeEventFactory {
  alias(...args: Parameters<EventFactory['alias']>): HightouchEvent
  group(...args: Parameters<EventFactory['group']>): HightouchEvent
  identify(...args: Parameters<EventFactory['identify']>): HightouchEvent
  track(...args: Parameters<EventFactory['track']>): HightouchEvent
  page(...args: Parameters<EventFactory['page']>): HightouchEvent
  screen(...args: Parameters<EventFactory['screen']>): HightouchEvent
}

export class NodeEventFactory extends EventFactory {
  constructor() {
    super({ createMessageId })
  }
}
