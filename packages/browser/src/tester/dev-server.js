#!/usr/bin/env node
/**
 * Local development server for manually testing the browser SDK.
 *
 * Usage:
 *   npm run serve
 *   npm run serve -- --port=8080
 *   npm run serve -- --writeKey=your_key --apiHost=us-east-1.hightouch-events.com
 *
 * Then open http://localhost:9900 in your browser.
 * Open DevTools Network tab to see requests being made.
 */

const http = require('http')
const fs = require('fs')
const path = require('path')

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.replace(/^--/, '').split('=')
  acc[key] = value || true
  return acc
}, {})

const PORT = parseInt(args.port || process.env.PORT || '9900', 10)
const WRITE_KEY = args.writeKey || 'test_write_key_for_local_dev'
const API_HOST = args.apiHost || 'us-east-1.hightouch-events.com'

const DIST_DIR = path.join(__dirname, '../../dist/umd')

// Check if the build exists
if (!fs.existsSync(path.join(DIST_DIR, 'index.js'))) {
  console.error('\n❌ Build not found at packages/browser/dist/umd/')
  console.error('   Run "npm run build" first from the repo root.\n')
  process.exit(1)
}

const HTML_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>HtEvents Browser SDK - Local Test</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      background: #1a1a2e;
      color: #eee;
    }
    h1 { color: #00d4ff; }
    .config { background: #16213e; padding: 15px; border-radius: 8px; margin: 20px 0; }
    .config code { color: #00ff88; }
    button {
      background: #00d4ff;
      color: #1a1a2e;
      border: none;
      padding: 10px 20px;
      margin: 5px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
    }
    button:hover { background: #00b8e6; }
    .events { background: #16213e; padding: 15px; border-radius: 8px; margin-top: 20px; }
    .event-log { font-family: monospace; font-size: 12px; color: #888; margin-top: 10px; }
    .success { color: #00ff88; }
    .info { color: #888; margin-top: 20px; font-size: 14px; }
  </style>
</head>
<body>
  <h1>🧪 HtEvents Browser SDK</h1>
  <p>Local development testing page</p>

  <div class="config">
    <strong>Configuration:</strong><br>
    <code>writeKey: "${WRITE_KEY}"</code><br>
    <code>apiHost: "${API_HOST}"</code><br>
    <code>SDK: http://localhost:${PORT}/events.min.js</code>
  </div>

  <div class="events">
    <strong>Test Events:</strong><br><br>
    <button onclick="testIdentify()">identify()</button>
    <button onclick="testTrack()">track()</button>
    <button onclick="testPage()">page()</button>
    <button onclick="testGroup()">group()</button>
    <button onclick="testReset()">reset()</button>
    <div class="event-log" id="log"></div>
  </div>

  <div class="info">
    <strong>Tips:</strong>
    <ul>
      <li>Open DevTools → Network tab to see requests</li>
      <li>Open DevTools → Console to see SDK logs</li>
      <li>Use <code>window.htevents</code> in console for direct access</li>
      <li>Restart server with <code>--writeKey=YOUR_KEY</code> to use a real key</li>
    </ul>
  </div>

  <script type="text/javascript">
    // HtEvents Snippet (loads local build)
    !(function () {
      var e = (window.htevents = window.htevents || []);
      if (!e.initialize)
        if (e.invoked)
          window.console &&
            console.error &&
            console.error("Hightouch snippet included twice.");
        else {
          (e.invoked = !0),
            (e.methods = [
              "trackSubmit",
              "trackClick",
              "trackLink",
              "trackForm",
              "pageview",
              "identify",
              "reset",
              "group",
              "track",
              "ready",
              "alias",
              "debug",
              "page",
              "once",
              "off",
              "on",
              "addSourceMiddleware",
              "addIntegrationMiddleware",
              "setAnonymousId",
              "addDestinationMiddleware",
            ]),
            (e.factory = function (t) {
              return function () {
                var n = Array.prototype.slice.call(arguments);
                return n.unshift(t), e.push(n), e;
              };
            });
          for (var t = 0; t < e.methods.length; t++) {
            var n = e.methods[t];
            e[n] = e.factory(n);
          }
          (e.load = function (t, n) {
            var o = document.createElement("script");
            (o.type = "text/javascript"),
              (o.async = !0),
              (o.src = "http://localhost:${PORT}/events.min.js");
            var r = document.getElementsByTagName("script")[0];
            r.parentNode.insertBefore(o, r),
              (e._loadOptions = n),
              (e._writeKey = t);
          }),
            (e.SNIPPET_VERSION = "0.0.1"),
            e.load("${WRITE_KEY}", {
              apiHost: "${API_HOST}"
            }),
            e.page();
        }
    })();

    // Helper to log events to the page
    function log(msg) {
      var el = document.getElementById('log');
      var time = new Date().toLocaleTimeString();
      el.innerHTML = '<span class="success">✓</span> [' + time + '] ' + msg + '<br>' + el.innerHTML;
      console.log('[HtEvents Test]', msg);
    }

    function testIdentify() {
      htevents.identify('user_' + Date.now(), {
        name: 'Test User',
        email: 'test@example.com'
      });
      log('identify() called');
    }

    function testTrack() {
      htevents.track('Button Clicked', {
        button_name: 'test_track',
        timestamp: new Date().toISOString()
      });
      log('track("Button Clicked") called');
    }

    function testPage() {
      htevents.page('Test Page', {
        url: window.location.href
      });
      log('page("Test Page") called');
    }

    function testGroup() {
      htevents.group('group_' + Date.now(), {
        name: 'Test Company',
        plan: 'enterprise'
      });
      log('group() called');
    }

    function testReset() {
      htevents.reset();
      log('reset() called - anonymous ID cleared');
    }

    // Log when SDK is ready
    htevents.ready(function() {
      log('SDK ready! Anonymous ID: ' + (htevents.user && htevents.user().anonymousId && htevents.user().anonymousId()));
    });
  </script>
</body>
</html>
`

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0]

  // Serve the test HTML page
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(HTML_TEMPLATE)
    return
  }

  // Serve any .js file from dist/umd (main bundle + chunks)
  // Handles both /events.min.js and /dist/umd/events.min.js paths
  if (url.endsWith('.js')) {
    // Strip /dist/umd/ prefix if present (dev build uses this path)
    const cleanUrl = url.replace(/^\/dist\/umd\//, '/')
    const fileName = path.basename(cleanUrl)
    const filePath = path.join(DIST_DIR, fileName)
    if (fs.existsSync(filePath)) {
      res.writeHead(200, {
        'Content-Type': 'application/javascript',
        'Access-Control-Allow-Origin': '*',
      })
      fs.createReadStream(filePath).pipe(res)
      return
    }
  }

  // Serve source maps if requested
  if (url.endsWith('.map')) {
    const cleanUrl = url.replace(/^\/dist\/umd\//, '/')
    const filePath = path.join(DIST_DIR, path.basename(cleanUrl))
    if (fs.existsSync(filePath)) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      })
      fs.createReadStream(filePath).pipe(res)
      return
    }
  }

  // 404 for everything else
  res.writeHead(404)
  res.end('Not found')
})

server.listen(PORT, () => {
  console.log(`
┌─────────────────────────────────────────────────────────────┐
│  🧪 HtEvents Browser SDK - Local Dev Server                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Test page:  http://localhost:${PORT.toString().padEnd(27)}│
│  SDK URL:    http://localhost:${PORT}/events.min.js${' '.repeat(14)}│
│                                                             │
│  Write Key:  ${WRITE_KEY.substring(0, 40).padEnd(40)}│
│  API Host:   ${API_HOST.padEnd(40)}│
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Options:                                                   │
│    --port=NUMBER      Change port (default: 9900)           │
│    --writeKey=KEY     Use a real write key                  │
│    --apiHost=HOST     Change API host                       │
│                                                             │
│  Press Ctrl+C to stop                                       │
└─────────────────────────────────────────────────────────────┘
`)
})