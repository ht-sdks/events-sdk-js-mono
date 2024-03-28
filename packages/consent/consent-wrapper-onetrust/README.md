# @ht-sdks/events-sdk-js-consent-wrapper-onetrust

<img src="img/onetrust-popup.jpg" width="500" />

## Installation

### Include the OneTrust Banner SDK script

```html
<head>
  <!-- This should be included before the Hightouch snippet -->
  <script
    src="https://cdn.cookielaw.org/scripttemplates/otSDKStub.js"
    type="text/javascript"
    charset="UTF-8"
    data-domain-script="0000-0000-000-test"
  ></script>
</head>
```

### Verify OneTrust category configuration

![onetrust category ids](img/onetrust-cat-id.jpg)

- Debugging: this library expects the [OneTrust Banner SDK](https://my.onetrust.com/s/article/UUID-d8291f61-aa31-813a-ef16-3f6dec73d643?language=en_US) to be available in order interact with OneTrust. This library derives the group IDs that are active for the current user from the `window.OneTrustActiveGroups` object provided by the OneTrust SDK. [Read this for more information](https://my.onetrust.com/s/article/UUID-66bcaaf1-c7ca-5f32-6760-c75a1337c226?language=en_US).

### For `npm` library users

1. Install the package

```sh
# npm
npm install @ht-sdks/events-sdk-js-consent-wrapper-onetrust

# yarn
yarn add @ht-sdks/events-sdk-js-consent-wrapper-onetrust

# pnpm
pnpm add @ht-sdks/events-sdk-js-consent-wrapper-onetrust
```

2. Initialize with `HtEventsBrowser`

```ts
import { withOneTrust } from '@ht-sdks/events-sdk-js-consent-wrapper-onetrust'
import { HtEventsBrowser } from '@ht-sdks/events-sdk-js-browser'

export const htevents = new HtEventsBrowser()

withOneTrust(htevents).load({ writeKey: 'WRITE_KEY' })

```

### For snippet users (`window.htevents`)

1. In your head

```html
<head>
  <!-- OneTrust -->
  <script
    src="https://cdn.cookielaw.org/scripttemplates/otSDKStub.js"
    type="text/javascript"
    charset="UTF-8"
    data-domain-script="YOUR-DOMAIN-SCRIPT-ID"
  ></script>

  <!-- OneTrust Consent Wrapper -->
  <script src="https://unpkg.com/@ht-sdks/events-sdk-js-consent-wrapper-onetrust@latest/dist/umd/analytics-onetrust.umd.js"></script>

  <!-- Hightouch SDK -->
  <script type="text/javascript">
    !function(){var e=window.htevents...
    ....
    // replace `e.load('WRITE_KEY')` with `withOneTrust(e).load('WRITE_KEY')`
    withOneTrust(e).load('WRITE_KEY')
    ....
  </script>
</head>
```

> [!NOTE]
> You must replace `e.load(...)` in the original Hightouch SDK snippet with `withOneTrust(e).load(...)` in order to integrate with OneTrust.

### Environments

#### Build Artifacts

- We build three versions of the library:

1. `cjs` (CommonJS modules) - for npm library users
2. `esm` (es6 modules) - for npm library users
3. `umd` (bundle) - for snippet users (typically)

#### Browser Support

- `cjs/esm` - Support modern JS syntax (ES2020). These are our npm library users, so we expect them to transpile this module themselves using something like babel/webpack if they need extra legacy browser support.

- `umd` - Support back to IE11, but **do not** polyfill . See our docs on [supported browsers](https://hightouch.com/docs/connections/sources/catalog/libraries/website/javascript/supported-browsers).

In order to get full ie11 support, you are expected to bring your own polyfills. e.g. adding the following to your script tag:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/babel-polyfill/7.7.0/polyfill.min.js"></script>
```

or

```html
<script src="https://polyfill.io/v3/polyfill.min.js?features=es5,es2015,es2016,es2017,es2018,es2019,es2020&flags=gated"></script>
```
