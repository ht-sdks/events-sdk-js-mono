import type { CorePlugin } from '@ht-sdks/events-sdk-js-core'
import type { Analytics } from '../analytics-node'
import type { Context } from '../context'

export interface Plugin extends CorePlugin<Context, Analytics> {}
