import type { AnalyticsSnippet } from '@ht-sdks/events-sdk-js'

declare global {
  interface Window {
    analytics: AnalyticsSnippet
  }
}
