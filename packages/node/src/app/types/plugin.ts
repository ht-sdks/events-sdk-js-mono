import type { CorePlugin } from '@ht-sdks/events-sdk-js-core'
import type { HtEvents } from '../analytics-node'
import type { Context } from '../context'

export interface Plugin extends CorePlugin<Context, HtEvents> {}
