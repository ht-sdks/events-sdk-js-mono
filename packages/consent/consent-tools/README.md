# @ht-sdks/events-sdk-js-consent-tools

This package provides a generic interface for integrating with a Consent Management Platform (CMP). We currently offer an implementation for [OneTrust](https://www.onetrust.com/) via the [`@ht-sdks/events-sdk-js-consent-wrapper-onetrust`](../consent-wrapper-onetrust) package. You can use this library for integrating with other CMPs.

## Usage

```ts
// wrapper.js
import { createWrapper, resolveWhen } from '@ht-sdks/events-sdk-js-consent-tools'

export const withCMP = createWrapper({
  // Wrapper waits to load htevents / get categories until this function resolves
  shouldLoad: async (ctx) => {
    const CMP = await getCMP()
    await resolveWhen(() => !CMP.popUpVisible())

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
 await resolveWhen(() => window.CMP != null)
 return window.CMP
}
```

## Installation

## `npm`

```js
import { HtEventsBrowser } from '@ht-sdks/events-sdk-js-browser'
import { withCMP } from './cmp-wrapper'

export const htevents = new HtEventsBrowser()

withCMP(htevents).load({ writeKey: 'WRITE_KEY' })
```

## Snippet users (window.htevents)
### Note: This assumes a project that can consume the library via es6 imports, using a like Webpack.

1. Delete the `htevents.load()` line from the snippet

```diff
- htevents.load('WRITE_KEY');
```

2. Import Analytics

```js
import { withCMP } from './cmp-wrapper'

withCMP(window.htevents).load('WRITE_KEY')
```

## Wrapper Implementations

- [OneTrust](../consent-wrapper-onetrust)

### Settings / Options / Configuration

See the complete list of settings in the **[Settings interface](src/types/settings.ts)**

### Development

1. Build this package + all dependencies

```sh
npx turbo build
```

2. Run tests

```sh
npx turbo test
```
