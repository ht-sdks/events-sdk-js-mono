import { HtEventsSnippet } from '../browser/standalone-interface'

/**
 * Stores the global window analytics key
 */
let _globalAnalyticsKey = 'htevents'

/**
 * Gets the global analytics/buffer
 * @param key name of the window property where the buffer is stored (default: analytics)
 * @returns HtEventsSnippet
 */
export function getGlobalAnalytics(): HtEventsSnippet | undefined {
  return (window as any)[_globalAnalyticsKey]
}

/**
 * Replaces the global window key for the analytics/buffer object
 * @param key key name
 */
export function setGlobalAnalyticsKey(key: string) {
  _globalAnalyticsKey = key
}

/**
 * Sets the global analytics object
 * @param analytics analytics snippet
 */
export function setGlobalAnalytics(analytics: HtEventsSnippet): void {
  ;(window as any)[_globalAnalyticsKey] = analytics
}
