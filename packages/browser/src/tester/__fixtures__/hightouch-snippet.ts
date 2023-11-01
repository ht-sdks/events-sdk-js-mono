/* eslint-disable */

export const snippet = (writeKey: string, load: boolean = true, extra = '') => `
!(function () {
  var htevents = (window.htevents = window.htevents || [])
  if (!htevents.initialize)
    if (htevents.invoked) window.console && console.error && console.error('Hightouch snippet included twice.')
    else {
      htevents.invoked = !0
      htevents.methods = [
        'screen',
        'register',
        'deregister',
        'trackSubmit',
        'trackClick',
        'trackLink',
        'trackForm',
        'pageview',
        'identify',
        'reset',
        'group',
        'track',
        'ready',
        'alias',
        'debug',
        'page',
        'once',
        'off',
        'on',
        'addSourceMiddleware',
        'addIntegrationMiddleware',
        'setAnonymousId',
        'addDestinationMiddleware',
      ]
      htevents.factory = function (e) {
        return function () {
          var t = Array.prototype.slice.call(arguments)
          t.unshift(e)
          htevents.push(t)
          return htevents
        }
      }
      for (var e = 0; e < htevents.methods.length; e++) {
        var key = htevents.methods[e]
        htevents[key] = htevents.factory(key)
      }
      htevents.load = function (key, e) {
        var t = document.createElement('script')
        t.type = 'text/javascript'
        t.async = !0
        t.src = 'https://cdn.foo.com/analytics.js/v1/' + key + '/analytics.min.js'
        var n = document.getElementsByTagName('script')[0]
        n.parentNode.insertBefore(t, n)
        htevents._loadOptions = e
      }
      var smw1 = function ({}) {}
      htevents.addSourceMiddleware(smw1);
      htevents.SNIPPET_VERSION = '4.13.1'
      ${load && `htevents.load('${writeKey}')`}
      htevents.page()
      ${extra}
    }
})()
`
