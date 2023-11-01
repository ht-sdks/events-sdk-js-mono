import type {
  AnalyticsSnippet,
  HtEventsBrowser,
} from '@ht-sdks/events-sdk-js-browser'
import { createWrapper, AnyAnalytics } from '../../index'

type Extends<T, U> = T extends U ? true : false

{
  const wrap = createWrapper({ getCategories: () => ({ foo: true }) })
  wrap({} as HtEventsBrowser)
  wrap({} as AnalyticsSnippet)

  // see AnalyticsSnippet and HtEventsBrowser extend AnyAnalytics
  const f: Extends<AnalyticsSnippet, AnyAnalytics> = true
  const g: Extends<HtEventsBrowser, AnyAnalytics> = true
  console.log(f, g)

  // should be chainable
  wrap({} as HtEventsBrowser).load({ writeKey: 'foo' })
}
