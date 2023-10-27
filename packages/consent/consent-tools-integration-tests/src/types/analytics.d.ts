import type { AnalyticsSnippet } from '@ht-sdks/events-sdk-js-browser'

declare global {
  interface Window {
    htevents: AnalyticsSnippet
  }
}
