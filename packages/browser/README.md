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
$ turbo run build
$ turbo run test
```

> If you get "Cannot find module '@ht-sdks/events-sdk-js-browser' or its corresponding type declarations.ts(2307)" (in VSCode), you may have to "cmd+shift+p -> "TypeScript: Restart TS server"

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

## QA
Feature work and bug fixes should include tests. Run all [Jest](https://jestjs.io) tests:
```
$ turbo test
```
Lint all with [ESLint](https://github.com/typescript-eslint/typescript-eslint/):
```
$ turbo lint
```
