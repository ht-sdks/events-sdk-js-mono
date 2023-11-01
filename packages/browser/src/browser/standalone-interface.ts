import { Analytics, InitOptions } from '../core/analytics'

export interface HtEventsSnippet extends AnalyticsStandalone {
  load: (writeKey: string, options?: InitOptions) => void
}

export interface AnalyticsStandalone extends Analytics {
  _loadOptions?: InitOptions
  _writeKey?: string
  _cdn?: string
}
