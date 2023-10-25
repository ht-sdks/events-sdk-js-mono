// import { AES } from 'crypto-es/lib/aes'
// import { Utf8 } from 'crypto-es/lib/core'

// https://github.com/rudderlabs/rudder-sdk-js/blob/5494b0acbc6da3df088884b2d10a2d22c0811ffb/LICENSE
// MIT License

// Copyright (c) 2021 RudderStack

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

/**
 * Converts a base64 encoded string to bytes array
 * @param base64Str base64 encoded string
 * @returns bytes array
 */
const base64ToBytes = (base64Str: string): Uint8Array => {
  const binString = (window as any)?.atob(base64Str) ?? ''
  const bytes = binString.split('').map((char: string) => char.charCodeAt(0))
  return new Uint8Array(bytes)
}

/**
 * Decodes a base64 encoded string
 * @param value base64 encoded string
 * @returns decoded string
 */
const fromBase64 = (value: string): string =>
  new TextDecoder().decode(base64ToBytes(value))

/**
 * JSON parse the value
 * @param {*} value
 */
function parse(value: any) {
  // if not parsable, return as is without json parse
  try {
    return value ? JSON.parse(value) : null
  } catch (e) {
    return value || null
  }
}

// const rudderEncryptKey = 'Rudder'
// const rudderPrefixV1 = 'RudderEncrypt:'
const rudderPrefixV3 = 'RS_ENC_v3_'

/**
 * decrypt value originally made by rudder
 */
export function decryptRudderValue(value: string): string | null {
  try {
    if (!value || typeof value !== 'string' || value.trim() === '') {
      return null
    }

    // Try if its v1 encrypted
    // if (value.substring(0, rudderPrefixV1.length) === rudderPrefixV1) {
    //   return parse(AES.decrypt(
    //     value.substring(rudderPrefixV1.length),
    //     rudderEncryptKey
    //   ).toString(Utf8))
    // }

    // Try if its v3 encrypted
    if (value.substring(0, rudderPrefixV3.length) === rudderPrefixV3) {
      const parsed = parse(fromBase64(value.substring(rudderPrefixV3.length)))
      if (!parsed || typeof parsed !== 'string' || parsed.trim() === '') {
        return null
      }
      return parsed
    }
  } catch (error) {
    console.error(error)
  }
  return value
}
