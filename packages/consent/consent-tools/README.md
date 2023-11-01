# @ht-sdks/events-sdk-js-consent-tools

## Quick Start

```ts
// wrapper.js
import { createWrapper, resolveWhen } from '@ht-sdks/events-sdk-js-consent-tools'

export const withCMP = createWrapper({

  // Wrapper waits to load hightouch / get categories until this function returns / resolves
  shouldLoad: async (ctx) => {
    const CMP = await getCMP()
    await resolveWhen(
      () => !CMP.popUpVisible(),
      500
    )

    // Optional -- for granular control of initialization
    if (noConsentNeeded) {
      ctx.abort({ loadHightouchNormally: true })
    } else if (allTrackingDisabled) {
      ctx.abort({ loadHightouchNormally: false })
    }
  },

  getCategories: async () => {
    const CMP = await getCMP()
    return normalizeCategories(CMP.consentedCategories()) // Expected format: { foo: true, bar: false }
  },

  registerOnConsentChanged: async (setCategories) => {
    const CMP = await getCMP()
    CMP.onConsentChanged((event) => {
      setCategories(normalizeCategories(event.detail))
    })
  },
})


const getCMP = async () => {
 await resolveWhen(() => window.CMP !== undefined, 500)
 return window.CMP
}
```

## Wrapper Usage API

## `npm`

```js
import { withCMP } from './wrapper'
import { HtEventsBrowser } from '@ht-sdks/events-sdk-js-browser'

export const htevents = new HtEventsBrowser()

withCMP(htevents).load({
  writeKey: '<MY_WRITE_KEY'>
})

```

## Snippet users (window.htevents)
### Note: This assumes a project that can consume the library via es6 imports, using a like Webpack.

1. Delete the `htevents.load()` line from the snippet

```diff
- htevents.load("<MY_WRITE_KEY>");
```

2. Import Analytics

```js
import { withCMP } from './wrapper'

withCMP(window.htevents).load('<MY_WRITE_KEY')
```

## Wrapper Examples

- [OneTrust](../consent-wrapper-onetrust) (beta)

## Settings / Options / Configuration

See the complete list of settings in the **[Settings interface](src/types/settings.ts)**

## Special Requirements

- For npm users, this library expects a version of `@ht-sdks/events-sdk-js-browser` >= **1.53.1**. Note: If your library depends on this library, you should have the appropriate peer dependency declaration. See our `package.json` for an example.

## Development

1. Build this package + all dependencies

```sh
yarn . build
```

2. Run tests

```
yarn test
```
