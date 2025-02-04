import * as tsub from '../../lib/tsub'
import { DestinationMiddlewareFunction } from '../middleware'

// TODO: update tsub definition
type RoutingRuleMatcher = tsub.Matcher & {
  config?: {
    expr: string
  }
}

export type RoutingRule = tsub.Rule & {
  matchers: RoutingRuleMatcher[]
}

export const tsubMiddleware =
  (rules: RoutingRule[]): DestinationMiddlewareFunction =>
  ({ payload, integration, next }): void => {
    const store = new tsub.Store(rules)
    const rulesToApply = store.getRulesByDestinationName(integration)

    rulesToApply.forEach((rule) => {
      const { matchers, transformers } = rule

      for (let i = 0; i < matchers.length; i++) {
        if (tsub.matches(payload.obj, matchers[i])) {
          payload.obj = tsub.transform(payload.obj, transformers[i])

          if (payload.obj === null) {
            return next(null)
          }
        }
      }
    })

    next(payload)
  }
