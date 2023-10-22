/* eslint-disable @typescript-eslint/no-floating-promises */
import { getCDN, setGlobalCDNUrl } from '../lib/parse-cdn'
import { setVersionType } from '../lib/version-type'

if (process.env.ASSET_PATH) {
  if (process.env.ASSET_PATH === '/dist/umd/') {
    // @ts-ignore
    __webpack_public_path__ = '/dist/umd/'
  } else {
    const cdn = getCDN()
    setGlobalCDNUrl(cdn)

    // @ts-ignore
    __webpack_public_path__ = cdn
      ? cdn + `/${process.env.PATH_PREFIX}/${process.env.PATH_VERSION}/`
      : process.env.ASSET_PATH
  }
}

setVersionType('web')

import { install } from './standalone-analytics'
import '../lib/csp-detection'
import { shouldPolyfill } from '../lib/browser-polyfill'
import { isAnalyticsCSPError } from '../lib/csp-detection'

let ajsIdentifiedCSP = false

// @ts-ignore
const sendErrorMetrics = (tags: string[]) => {
  // Uncomment to re-enable RemoteMetrics -- also see loadAnalytics() RemoteMetrics usage
  // // this should not be instantied at the root, or it will break ie11.
  // const metrics = new RemoteMetrics()
  // metrics.increment('analytics_js.invoke.error', [
  //   ...tags,
  //   `wk:${embeddedWriteKey()}`,
  // ])
}

function onError(err?: unknown) {
  console.error('[analytics.js]', 'Failed to load Analytics.js', err)
  sendErrorMetrics([
    'type:initialization',
    ...(err instanceof Error
      ? [`message:${err?.message}`, `name:${err?.name}`]
      : []),
  ])
}

document.addEventListener('securitypolicyviolation', (e) => {
  if (ajsIdentifiedCSP || !isAnalyticsCSPError(e)) {
    return
  }
  ajsIdentifiedCSP = true
  sendErrorMetrics(['type:csp'])
  console.warn('Your CSP policy is missing permissions required for HtEvents')
})

/**
 * Attempts to run a promise and catch both sync and async errors.
 **/
async function attempt<T>(promise: () => Promise<T>) {
  try {
    const result = await promise()
    return result
  } catch (err) {
    onError(err)
  }
}

if (shouldPolyfill()) {
  // load polyfills in order to get AJS to work with old browsers
  const script = document.createElement('script')
  script.setAttribute(
    'src',
    'https://cdnjs.cloudflare.com/ajax/libs/babel-polyfill/7.7.0/polyfill.min.js'
  )

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () =>
      document.body.appendChild(script)
    )
  } else {
    document.body.appendChild(script)
  }

  script.onload = function (): void {
    attempt(install)
  }
} else {
  attempt(install)
}
