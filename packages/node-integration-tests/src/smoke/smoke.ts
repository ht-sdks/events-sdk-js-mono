import { default as AnalyticsDefaultImport } from '@ht-sdks/events-sdk-js-node'
import { Analytics as AnalyticsNamedImport } from '@ht-sdks/events-sdk-js-node'

{
  // test named imports vs default imports
  new AnalyticsNamedImport({ writeKey: 'hello world' })
  new AnalyticsDefaultImport({ writeKey: 'hello world' })
}
