import type { CorePlugin } from '@ht-sdks/events-sdk-js-core'
import type { DestinationMiddlewareFunction } from '../../plugins/middleware'
import type { Analytics } from '../analytics'
import type { Context } from '../context'

export interface Plugin extends CorePlugin<Context, Analytics> {}

export interface DestinationPlugin extends Plugin {
  addMiddleware: (...fns: DestinationMiddlewareFunction[]) => void
}

export type AnyBrowserPlugin = Plugin | DestinationPlugin
