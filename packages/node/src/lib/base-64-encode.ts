// eslint-disable-next-line import-x/no-nodejs-modules
import { Buffer } from 'buffer'
/**
 * Base64 encoder that works in browser, worker, node runtimes.
 */
export const b64encode = (str: string): string => {
  return Buffer.from(str).toString('base64')
}
