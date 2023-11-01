export function next(writekey: string, obfuscate: boolean) {
  return `
    <html>
    <head></head>
    <script>
      !(function () {
        var htevents = (window.htevents = window.htevents || [])
        if (!htevents.initialize)
          if (htevents.invoked)
            window.console &&
              console.error &&
              console.error('Hightouch snippet included twice.')
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
              t.src = 'http://localhost:4000/dist/umd/standalone.js'
              var n = document.getElementsByTagName('script')[0]
              n.parentNode.insertBefore(t, n)
              htevents._loadOptions = e
            }
            htevents.SNIPPET_VERSION = '4.13.1'
            htevents._writeKey = '${writekey}'
            htevents.load('${writekey}', { obfuscate: ${obfuscate} })
          }
      })()
    </script>
    <body>
    next
    <img id="taylor" src="https://i.insider.com/57d1eef909d29325008b6cfa?width=1100&format=jpeg&auto=webp" />
    </body>
    </html>
  `
}

export function classic(writekey: string) {
  return `
  <html>
  <head>
  </head>
    <script>!(function () {
    var htevents = (window.htevents = window.htevents || [])
    if (!htevents.initialize)
      if (htevents.invoked)
        window.console &&
          console.error &&
          console.error('Hightouch snippet included twice.')
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
          t.src =
            'https://cdn.hightouch-events.com/htevents.js/v1/' +
            key +
            '/htevents.classic.js'
          var n = document.getElementsByTagName('script')[0]
          n.parentNode.insertBefore(t, n)
          htevents._loadOptions = e
        }
        htevents.SNIPPET_VERSION = '4.13.1'
        htevents.load('${writekey}')
      }
  })()</script>
  <body>
  classic
  <img id="taylor" src="https://i.insider.com/57d1eef909d29325008b6cfa?width=1100&format=jpeg&auto=webp" />
  </body>
  </html>
`
}
