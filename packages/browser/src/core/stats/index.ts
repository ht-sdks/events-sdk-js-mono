import { CoreStats } from '@ht-sdks/events-sdk-js-core'
import { MetricsOptions, RemoteMetrics } from './remote-metrics'

let remoteMetrics: RemoteMetrics | undefined

export class Stats extends CoreStats {
  static initRemoteMetrics(options?: MetricsOptions) {
    remoteMetrics = new RemoteMetrics(options)
  }

  override increment(metric: string, by?: number, tags?: string[]): void {
    super.increment(metric, by, tags)
    remoteMetrics?.increment(metric, tags ?? [])
  }
}
