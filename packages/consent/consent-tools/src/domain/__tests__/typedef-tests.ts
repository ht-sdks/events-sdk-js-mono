import type {
  HtEventsSnippet,
  HtEventsBrowser,
} from '@ht-sdks/events-sdk-js-browser'
import { createWrapper, AnyAnalytics } from '../../index'

type Extends<T, U> = T extends U ? true : false

{
  const wrap = createWrapper({ getCategories: () => ({ foo: true }) })
  wrap({} as HtEventsBrowser)
  wrap({} as HtEventsSnippet)

  // see HtEventsSnippet and HtEventsBrowser extend AnyAnalytics
  const f: Extends<HtEventsSnippet, AnyAnalytics> = true
  const g: Extends<HtEventsBrowser, AnyAnalytics> = true
  console.log(f, g)

  // should be chainable
  wrap({} as HtEventsBrowser).load({ writeKey: 'foo' })
}
