import { getGlobalAnalytics } from './global-analytics-helper'

const analyticsScriptRegex =
  /(https:\/\/.*)\/analytics\.js\/v1\/(?:.*?)\/(?:platform|analytics.*)?/
const getCDNUrlFromScriptTag = (): string | undefined => {
  let cdn: string | undefined
  const scripts = Array.prototype.slice.call(
    document.querySelectorAll('script')
  )
  scripts.forEach((s) => {
    const src = s.getAttribute('src') ?? ''
    const result = analyticsScriptRegex.exec(src)

    if (result && result[1]) {
      cdn = result[1]
    }
  })
  return cdn
}

let _globalCDN: string | undefined // set globalCDN as in-memory singleton
const getGlobalCDNUrl = (): string | undefined => {
  const result = _globalCDN ?? getGlobalAnalytics()?._cdn
  return result
}

export const setGlobalCDNUrl = (cdn: string) => {
  const globalAnalytics = getGlobalAnalytics()
  if (globalAnalytics) {
    globalAnalytics._cdn = cdn
  }
  _globalCDN = cdn
}

export const getCDN = (): string => {
  const globalCdnUrl = getGlobalCDNUrl()

  if (globalCdnUrl) return globalCdnUrl

  const cdnFromScriptTag = getCDNUrlFromScriptTag()

  if (cdnFromScriptTag) {
    return cdnFromScriptTag
  } else {
    // it's possible that the CDN is not found in the page because:
    // - the script is loaded through a proxy
    // - the script is removed after execution
    // in this case, we fall back to the default Hightouch CDN
    return `https://cdn.hightouch-events.com`
  }
}

export const getNextIntegrationsURL = () => {
  const cdn = getCDN()
  return `${cdn}/next-integrations`
}
