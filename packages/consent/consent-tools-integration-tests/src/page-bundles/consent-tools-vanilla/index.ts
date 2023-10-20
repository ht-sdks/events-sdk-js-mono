import { AnalyticsBrowser } from '@segment/analytics-next'
import { createWrapper } from '@segment/analytics-consent-tools'

const fakeCategories = { FooCategory1: true, FooCategory2: true }

const withCMP = createWrapper({
  getCategories: () => fakeCategories,
})

const htevents = new AnalyticsBrowser()

withCMP(htevents).load({
  writeKey: 'foo',
})

// for testing
;(window as any).htevents = htevents
