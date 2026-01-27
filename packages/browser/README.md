# Events Javascript SDK

## Installation via CDN

To integrate the JavaScript SDK with your website, place the following code snippet in the `<head>` section of your website.

```javascript
<script type="text/javascript">
!function(){var e=window.htevents=window.htevents||[];if(!e.initialize)if(e.invoked)window.console&&console.error&&console.error("Hightouch snippet included twice.");else{e.invoked=!0,e.methods=["trackSubmit","trackClick","trackLink","trackForm","pageview","identify","reset","group","track","ready","alias","debug","page","once","off","on","addSourceMiddleware","addIntegrationMiddleware","setAnonymousId","addDestinationMiddleware"],e.factory=function(t){return function(){var n=Array.prototype.slice.call(arguments);return n.unshift(t),e.push(n),e}};for(var t=0;t<e.methods.length;t++){var n=e.methods[t];e[n]=e.factory(n)}e.load=function(t,n){var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src="https://cdn.hightouch-events.com/browser/release/v1-latest/events.min.js";var r=document.getElementsByTagName("script")[0];r.parentNode.insertBefore(o,r),e._loadOptions=n,e._writeKey=t},e.SNIPPET_VERSION="0.0.1",
e.load(<WRITE_KEY>,{apiHost:<DATA_PLANE_URL>}),
e.page()}}();
</script>
```

`window.htevents.track(...)` will then be available for use.

### Alternative installation using NPM

1. Install the package

```sh
# npm
npm install @ht-sdks/events-sdk-js-browser

# yarn
yarn add @ht-sdks/events-sdk-js-browser

# pnpm
pnpm add @ht-sdks/events-sdk-js-browser
```

2. Import the package into your project and you're good to go (with working types)!

```ts
import { HtEventsBrowser } from '@ht-sdks/events-sdk-js-browser'

const htevents = HtEventsBrowser.load({ writeKey: '<YOUR_WRITE_KEY>' })

htevents.identify('hello world')

document.body?.addEventListener('click', () => {
  htevents.track('document body clicked!')
})
```

## Lazy / Delayed Loading
You can load a buffered version of htevents that requires `.load` to be explicitly called before initiating any network activity. This can be useful if you want to wait for a user to consent before fetching any tracking destinations or sending buffered events to hightouch.

- ⚠️ ️`.load` should only be called _once_.

```ts
export const htevents = new HtEventsBrowser()

htevents.identify("hello world")

if (userConsentsToBeingTracked) {
    htevents.load({ writeKey: '<YOUR_WRITE_KEY>' }) // destinations loaded, enqueued events are flushed
}
```

## Error Handling
### Handling initialization errors
If you want to catch initialization errors, you can do the following:
```ts
export const htevents = new HtEventsBrowser();
htevents
  .load({ writeKey: "MY_WRITE_KEY" })
  .catch((err) => ...);
```

## Usage in Common Frameworks / SPAs

### Vanilla React
```tsx
import { HtEventsBrowser } from '@ht-sdks/events-sdk-js-browser'

// We can export this instance to share with rest of our codebase.
export const htevents = HtEventsBrowser.load({ writeKey: '<YOUR_WRITE_KEY>' })

const App = () => (
  <div>
    <button onClick={() => htevents.track('hello world')}>Track</button>
  </div>
)
```



### Vue

1. Export htevents instance. E.g. `services/hightouch.ts`

```ts
import { HtEventsBrowser } from '@ht-sdks/events-sdk-js-browser'

export const htevents = HtEventsBrowser.load({
  writeKey: '<YOUR_WRITE_KEY>',
})
```

2. in `.vue` component

```tsx
<template>
  <button @click="track()">Track</button>
</template>

<script>
import { defineComponent } from 'vue'
import { htevents } from './services/hightouch'

export default defineComponent({
  setup() {
    function track() {
      htevents.track('Hello world')
    }

    return {
      track,
    }
  },
})
</script>
```

## How to add typescript support when using the CDN snippet

NOTE: this is only required for snippet installation.

NPM installation should already have type support.

1. Install npm package `@ht-sdks/events-sdk-js-browser` as a dev dependency.

2. Create `./typings/htevents.d.ts`
```ts
// ./typings/htevents.d.ts
import type { HtEventsSnippet } from "@ht-sdks/events-sdk-js-browser";

declare global {
  interface Window {
    htevents: HtEventsSnippet;
  }
}

```
3. Configure typescript to read from the custom `./typings` folder
```jsonc
// tsconfig.json
{
  ...
  "compilerOptions": {
    ....
    "typeRoots": [
      "./node_modules/@types",
      "./typings"
    ]
  }
  ....
}
```

---

## Development

First, clone the repo and then startup our local dev environment:

```sh
$ git clone git@github.com:ht-sdks/events-sdk-js-mono.git
$ cd events-sdk-js-mono
$ nvm use  # installs correct version of node defined in .nvmrc.
$ npm install
$ npx turbo run build
$ npx turbo run test
```

> If you get "Cannot find module '@ht-sdks/events-sdk-js-browser' or its corresponding type declarations.ts(2307)" (in VSCode), you may have to "cmd+shift+p -> "TypeScript: Restart TS server"

### Testing in a Browser

To manually test the SDK in an actual browser:

```sh
# Build for local development (important: don't use `npm run build`)
$ cd packages/browser
$ npm run build:dev

# Start the local dev server
$ npm run serve
```

Then open http://localhost:9900 in your browser. The test page includes:
- Buttons to trigger `identify`, `track`, `page`, `group`, and `reset` events
- The SDK loaded from your local build
- Event logging on the page

**Options:**

```sh
# Use a real write key
$ npm run serve -- --writeKey=your_write_key

# Change API host
$ npm run serve -- --apiHost=us-east-1.hightouch-events.com

# Change port
$ npm run serve -- --port=8080
```

**Tips:**
- Open DevTools → Network tab to see requests to the Events API
- Open DevTools → Console for SDK debug logs
- Use `window.htevents` in console for direct SDK access

> ⚠️ **Important:** Use `build:dev`, not `build`. The production build hardcodes the CDN URL for loading chunks, which won't work with the local dev server.

# Plugins

When developing against Events SDK JS you will likely be writing plugins, which can augment functionality and enrich data. Plugins are isolated chunks which you can build, test, version, and deploy independently of the rest of the codebase. Plugins are bounded by Events SDK JS which handles things such as observability, retries, and error management.

Plugins can be of two different priorities:

1. **Critical**: Events SDK JS should expect this plugin to be loaded before starting event delivery
2. **Non-critical**: Events SDK JS can start event delivery before this plugin has finished loading

and can be of five different types:

1. **Before**: Plugins that need to be run before any other plugins are run. An example of this would be validating events before passing them along to other plugins.
2. **After**: Plugins that need to run after all other plugins have run. An example of this is the Hightouch.io integration, which will wait for destinations to succeed or fail so that it can send its observability metrics.
3. **Destination**: Destinations to send the event to (ie. legacy destinations). Does not modify the event and failure does not halt execution.
4. **Enrichment**: Modifies an event, failure here could halt the event pipeline.
5. **Utility**: Plugins that change Events SDK JS functionality and don't fall into the other categories.

Here is an example of a simple plugin that would convert all track events event names to lowercase before the event gets sent through the rest of the pipeline:

```ts
import type { Plugin } from '@ht-sdks/events-sdk-js-browser'

export const lowercase: Plugin = {
  name: 'Lowercase Event Name',
  type: 'before',
  version: '1.0.0',

  isLoaded: () => true,
  load: () => Promise.resolve(),

  track: (ctx) => {
    ctx.event.event = ctx.event.event.toLowerCase()
    return ctx
  }
}

htevents.register(lowercase)
```

For further examples check out our [existing plugins](/packages/browser/src/plugins).

## Source Middleware

Source middleware allows for defining a function to manipulate the event payload and filter events on a per source basis. It's a specialized `before` [`Plugin`](#plugins) that makes it easy to do things like enriching the event `context` with custom fields.

```ts
htevents.addSourceMiddleware(({ payload, next }) => {
  const event = payload.obj;
  event.context = {
    ...event.context,
    customField: "123",
  };
  next(payload);
});
```

# Client-side destinations

The Browser SDK supports sending events directly from the client to destinations which is useful in situations where the destination requires a client-side context in order to fully enrich and attribute events.

## Google Tag Manager

The Google Tag Manager integration pushes events directly to [Google Tag Manager](https://support.google.com/tagmanager/answer/6102821?hl=en). This tag in turn can forward to a variety of other tools.

### Installation

Make sure your Google Tag Manager setup scripts are configured on your website. Our implementation expects `window.dataLayer` to be available in the global scope.

```html
<!-- example Google Tag Manager script -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-XXXXXXXX');</script>
```

You can then configure the Browser SDK to send events directly to Google Tag Manager by enabling the `Google Tag Manager` destination:

```js
htevents.load('WRITE_KEY', {
  destinations: {
    'Google Tag Manager': {},
  },
})
```

View the complete plugin documentation in [`google-tag-manager.ts`](src/plugins/destinations/google-tag-manager.ts#L12)

### Usage

Once the destination is configured, all applicable `identify`, `track`, and `page` events will be sent. The integration also automatically populates the `userId` and `hightouchAnonymousId` fields.

```js
htevents.track('My Event', { prop: 'abc' })
// This results in the following Google Tag Manager event.
// window.dataLayer.push({ event: 'My Event', prop: 'abc', user_id: '123', hightouch_anonymous_id: '456' })
```

## gtag.js

The Google Tag (gtag.js) integration pushes events directly to [gtag.js](https://developers.google.com/tag-platform/gtagjs). This tag in turn can forward to a variety of Google products, including Google Ads, Google Analytics, Campaign Manager, Display & Video 360, and Search Ads 360.

### Installation

Make sure your gtag.js setup scripts are configured on your website. Our implementation expects the `gtag` function to be available in the global scope.

```html
<!-- example GA4 setup using gtag.js -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXX" ></script>
<script>
  window.dataLayer = window.dataLayer || []
  function gtag() {
    dataLayer.push(arguments)
  }
  gtag('js', new Date())
  gtag('config', 'G-XXXXXXXX')
</script>
```

You can then configure the Browser SDK to send events directly to gtag.js by enabling the `gtag` destination:

```js
htevents.load('WRITE_KEY', {
  destinations: {
    gtag: {
      // Events are only forwarded to the configured measurement IDs.
      // For example, if you'd like to forward to GA4, you should include
      // your GA4 measurement ID here.
      measurementId: 'G-XXXXXXXX',
    },
  },
})
```

View the complete plugin documentation in [`gtag.ts`](src/plugins/destinations/gtag.ts#L11)

### Usage

Once the destination is configured, all applicable `identify`, `track`, and `page` events will be sent. The integration also automatically populates the `user_id` and `hightouch_anonymous_id` fields.

```js
htevents.track('My Event', { prop: 'abc' })
// This results in the following gtag call.
// gtag('event', 'My Event', { prop: 'abc', user_id: '123', hightouchAnonymousId: '456'  })
```

## Custom client-side destinations

If you'd like to send events to a custom client-side destination that is not yet supported, you can do so using the `Destination` class as a template and implement the relevant tracking methods (`track`, `page`, etc).

```ts
import { HtEventsBrowser, Destination } from "@ht-sdks/events-sdk-js-browser";

const htevents = new HtEventsBrowser();

htevents.load({ writeKey: "WRITE_KEY" });

// register custom client-side destination
htevents.register(
  new Destination("Console", "1.2.3", {
    track: (ctx) => {
      console.log("[console.track]", ctx.event);
    },
  })
);
```

## QA
Feature work and bug fixes should include tests. Run all [Jest](https://jestjs.io) tests:
```
$ npx turbo test
```
Lint all with [ESLint](https://github.com/typescript-eslint/typescript-eslint/):
```
$ npx turbo lint
```
