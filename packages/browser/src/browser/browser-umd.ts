import { getCDN, setGlobalCDNUrl } from '../lib/parse-cdn'
import { setVersionType } from '../lib/version-type'

if (process.env.ASSET_PATH) {
  if (process.env.ASSET_PATH === '/dist/umd/') {
    // @ts-ignore
    __webpack_public_path__ = '/dist/umd/'
  } else {
    const cdn = getCDN()
    setGlobalCDNUrl(cdn) // preserving original behavior -- TODO: neccessary?
    // must match pathPrefix in release.js
    // @ts-ignore
    __webpack_public_path__ = cdn + `/releast-test/${process.env.VERSION_PATH}/`
  }
}

setVersionType('web')

export * from '.'
