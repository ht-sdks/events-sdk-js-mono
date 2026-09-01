/**
 * Local stand-in for a classic analytics.js destination, such as:
 * https://github.com/segmentio/analytics.js-integrations/blob/master/integrations/appcues/lib/index.js
 */

import { ClassicIntegrationBuilder } from '../../plugins/ajs-destination/types'

export const mockIntegrationName = 'Fake'

function FakeIntegration(this: FakeIntegration, _options?: object) {
  // classic integration constructor
}

interface FakeIntegration {
  name: string
  initialize: () => void
  loaded: () => boolean
  track: () => void
  load: (callback: Function) => void
  ready?: () => void
}

FakeIntegration.prototype.name = mockIntegrationName

FakeIntegration.prototype.initialize = function () {
  this.load(this.ready)
}

FakeIntegration.prototype.loaded = function () {
  return true
}

FakeIntegration.prototype.track = function () {}

FakeIntegration.prototype.load = function (callback: Function) {
  // this callback is important to actually initialize.
  callback()
}

export const Fake = FakeIntegration as unknown as ClassicIntegrationBuilder
