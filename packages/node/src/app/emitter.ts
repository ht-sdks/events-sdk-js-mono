import { CoreEmitterContract, Emitter } from '@ht-sdks/events-sdk-js-core'
import { Context } from './context'
import type { AnalyticsSettings } from './settings'
import { HightouchEvent } from './types'

/**
 * Map of emitter event names to method args.
 */
export type NodeEmitterEvents = CoreEmitterContract<Context> & {
  initialize: [AnalyticsSettings]
  call_after_close: [HightouchEvent] // any event that did not get dispatched due to close
  http_request: [
    {
      url: string
      method: string
      headers: Record<string, string>
      body: Record<string, any>
    }
  ]
  drained: []
}

export class NodeEmitter extends Emitter<NodeEmitterEvents> {}
