import type { DestinationPlugin, Plugin } from '../../core/plugin'
import { Context, ContextCancelation } from '../../core/context'
import {
  applyDestinationMiddleware,
  DestinationMiddlewareFunction,
} from '../middleware'

export class Destination implements DestinationPlugin {
  readonly type = 'destination'
  readonly middleware: DestinationMiddlewareFunction[] = []

  constructor(
    readonly name: string,
    readonly version: string,
    readonly actions: Pick<
      Plugin,
      'alias' | 'group' | 'identify' | 'page' | 'screen' | 'track'
    >
  ) {}

  isLoaded() {
    return true
  }

  load() {
    return Promise.resolve()
  }

  addMiddleware(...fn: DestinationMiddlewareFunction[]) {
    this.middleware.push(...fn)
  }

  alias = this._createMethod('alias')
  group = this._createMethod('group')
  identify = this._createMethod('identify')
  page = this._createMethod('page')
  screen = this._createMethod('screen')
  track = this._createMethod('track')

  private async transform(ctx: Context): Promise<Context> {
    const modifiedEvent = await applyDestinationMiddleware(
      this.name,
      ctx.event,
      this.middleware
    )

    if (modifiedEvent == null) {
      ctx.cancel(
        new ContextCancelation({
          retry: false,
          reason: 'dropped by destination middleware',
        })
      )
    }

    return new Context(modifiedEvent)
  }

  private _createMethod(
    action: 'track' | 'page' | 'identify' | 'alias' | 'group' | 'screen'
  ) {
    return async (ctx: Context): Promise<Context> => {
      if (!this.actions[action]) return ctx

      const transformedCtx = await this.transform(ctx)

      await this.actions[action]!(transformedCtx)

      return ctx
    }
  }
}
