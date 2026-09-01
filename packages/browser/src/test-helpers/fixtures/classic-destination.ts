/**
 * Local stand-in for a classic analytics.js destination, such as:
 * https://github.com/segmentio/analytics.js-integrations/blob/master/integrations/appcues/lib/index.js
 */

export const mockIntegrationName = 'Fake'

export interface FakeIntegration {
  name: string
  initialize: () => void
  loaded: () => boolean
  track: () => void
  load: (callback: Function) => void
  ready?: () => void
}

export function Fake(this: FakeIntegration, _options?: object) {
  // classic integration constructor
}

Fake.prototype.name = mockIntegrationName

Fake.prototype.initialize = function () {
  this.load(this.ready)
}

Fake.prototype.loaded = function () {
  return true
}

Fake.prototype.track = function () {}

Fake.prototype.load = function (callback: Function) {
  // this callback is important to actually initialize.
  callback()
}
