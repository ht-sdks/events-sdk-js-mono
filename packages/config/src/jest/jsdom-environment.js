const JSDOMEnvironment = require('@jest/environment-jsdom-abstract').default
const jsdom = require('jsdom')

/**
 * Jest 30's default jsdom 26 marks window/document/location as
 * [LegacyUnforgeable], which breaks spies and location mocks.
 *
 * There is no maintained jsdom fork that relaxes those properties. Jest's
 * supported escape hatch is @jest/environment-jsdom-abstract with a custom
 * jsdom version. The workspace already has jsdom 20 (browser package), which
 * still allows those properties to be redefined.
 */
class JSDOMEnvironmentWithJsdom20 extends JSDOMEnvironment {
  constructor(config, context) {
    super(config, context, jsdom)
  }
}

module.exports = JSDOMEnvironmentWithJsdom20
