import { Transformer } from './store'
import MD5 from 'spark-md5'
import get from 'dlv'
import { dset } from 'dset'
import { unset } from './unset'

export type KeyTarget = Record<string, string[]>

export interface TransformerConfig {
  allow?: KeyTarget
  drop?: KeyTarget
  sample?: TransformerConfigSample
  map?: Record<string, TransformerConfigMap>
}

export interface TransformerConfigSample {
  percent: number
  path: string
}

export interface TransformerConfigMap {
  set?: any
  copy?: string
  move?: string
  to_string?: boolean
}

export default function transform(
  payload: any,
  transformers: Transformer[]
): any {
  const transformedPayload = payload

  for (const transformer of transformers) {
    switch (transformer.type) {
      case 'drop':
        return null
      case 'drop_properties':
        dropProperties(transformedPayload, transformer.config!)
        break
      case 'allow_properties':
        allowProperties(transformedPayload, transformer.config!)
        break
      case 'sample_event':
        if (sampleEvent(transformedPayload, transformer.config!)) {
          break
        }
        return null
      case 'map_properties':
        mapProperties(transformedPayload, transformer.config!)
        break
      case 'hash_properties':
        // Not yet supported, but don't throw an error. Just ignore.
        break
      default:
        throw new Error(
          `Transformer of type "${transformer.type}" is unsupported.`
        )
    }
  }

  return transformedPayload
}

// dropProperties removes all specified props from the object.
function dropProperties(payload: any, config: TransformerConfig) {
  filterProperties(payload, config.drop!, (matchedObj, dropList) => {
    dropList.forEach((k) => delete matchedObj[k])
  })
}

// allowProperties ONLY allows the specific targets within the keys. (e.g. "a.foo": ["bar", "baz"]
// on {a: {foo: {bar: 1, baz: 2}, other: 3}} will not have any drops, as it only looks inside a.foo
function allowProperties(payload: any, config: TransformerConfig) {
  filterProperties(payload, config.allow!, (matchedObj, preserveList) => {
    Object.keys(matchedObj).forEach((key) => {
      if (!preserveList.includes(key)) {
        delete matchedObj[key]
      }
    })
  })
}

function filterProperties(
  payload: any,
  ruleSet: KeyTarget,
  filterCb: (matchedObject: any, targets: string[]) => void
) {
  Object.entries(ruleSet).forEach(([key, targets]) => {
    const filter = (obj: any) => {
      // Can only act on objects.
      if (typeof obj !== 'object' || obj === null) {
        return
      }

      filterCb(obj, targets)
    }

    // If key is empty, it refers to the top-level object.
    const matchedObject = key === '' ? payload : get(payload, key)

    if (Array.isArray(matchedObject)) {
      matchedObject.forEach(filter)
    } else {
      filter(matchedObject)
    }
  })
}

function mapProperties(payload: any, config: TransformerConfig) {
  // Some configs might try to modify or read from a field multiple times. We will only ever read
  // values as they were before any modifications began. Thus, if you try to override e.g.
  // {a: {b: 1}} with set(a, 'b', 2) (which results in {a: {b: 2}}) and then try to copy a.b into
  // a.c, you will get {a: {b: 2, c:1}} and NOT {a: {b:2, c:2}}. This prevents map evaluation
  // order from mattering, and === what server-side does.
  // See: https://github.com/segmentio/tsub/blob/661695a63b60b90471796e667458f076af788c19/transformers/map_properties.go#L179-L200
  const initialPayload = JSON.parse(JSON.stringify(payload))

  for (const key in config.map) {
    if (!Object.prototype.hasOwnProperty.call(config.map, key)) {
      continue
    }

    const actionMap: TransformerConfigMap = config.map[key]

    // Can't manipulate non-objects. Check that the parent is one. Strip the last .field
    // from the string.
    const splitKey = key.split('.')
    let parent
    if (splitKey.length > 1) {
      splitKey.pop()
      parent = get(initialPayload, splitKey.join('.'))
    } else {
      parent = payload
    }

    if (typeof parent !== 'object') {
      continue
    }

    // These actions are exclusive to each other.
    if (actionMap.copy) {
      const valueToCopy = get(initialPayload, actionMap.copy)
      if (valueToCopy !== undefined) {
        dset(payload, key, valueToCopy)
      }
    } else if (actionMap.move) {
      const valueToMove = get(initialPayload, actionMap.move)
      if (valueToMove !== undefined) {
        dset(payload, key, valueToMove)
      }

      unset(payload, actionMap.move)
    }
    // Have to check only if property exists, as null, undefined, and other vals could be explicitly set.
    else if (Object.prototype.hasOwnProperty.call(actionMap, 'set')) {
      dset(payload, key, actionMap.set)
    }

    // to_string is not exclusive and can be paired with other actions. Final action.
    if (actionMap.to_string) {
      const valueToString = get(payload, key)

      // Do not string arrays and objects. Do not double-encode strings.
      if (
        typeof valueToString === 'string' ||
        (typeof valueToString === 'object' && valueToString !== null)
      ) {
        continue
      }

      // TODO: Check stringifier in Golang for parity.
      if (valueToString !== undefined) {
        dset(payload, key, JSON.stringify(valueToString))
      } else {
        // TODO: Check this behavior.
        dset(payload, key, 'undefined')
      }
    }
  }
}

function sampleEvent(payload: any, config: TransformerConfig): boolean {
  if (config.sample!.percent <= 0) {
    return false
  } else if (config.sample!.percent >= 1) {
    return true
  }

  // If we're not filtering deterministically, just use raw percentage.
  if (!config.sample!.path) {
    return samplePercent(config.sample!.percent)
  }

  // Otherwise, use a deterministic hash.
  return sampleConsistentPercent(payload, config)
}

function samplePercent(percent: number): boolean {
  // Math.random returns [0, 1) => 0.0<>0.9999...
  return Math.random() <= percent
}

// sampleConsistentPercent converts an input string of bytes into a consistent uniform
// continuous distribution of [0.0, 1.0]. This is based on
// http://mumble.net/~campbell/tmp/random_real.c, but using the digest
// result of the input value as the random information.

// IMPORTANT - This function needs to === the Golang implementation to ensure that the two return the same vals!
// See: https://github.com/segmentio/sampler/blob/65cb04132305a04fcd4bcaef67d57fbe40c30241/sampler.go#L13-L38

// Since AJS supports IE9+ (typed arrays were introduced in IE10) we're doing some manual array math.
// This could be done directly with strings, but arrays are easier to reason about/have better function support.
function sampleConsistentPercent(
  payload: any,
  config: TransformerConfig
): boolean {
  const field = get(payload, config.sample!.path)

  const hash = MD5.hash(JSON.stringify(field))
  // convert hash to byte array
  const digest = hash.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))

  let exponent = -64

  // Manually maintain 64-bit int as an array.
  let significand: number[] = []

  // Left-shift and OR for first 8 bytes of digest. (8 bytes * 8 = 64 bits)
  consumeDigest(digest.slice(0, 8), significand)

  let leadingZeros = 0
  for (let i = 0; i < 64; i++) {
    if (significand[i] === 1) {
      break
    }

    leadingZeros++
  }

  if (leadingZeros !== 0) {
    // Use the last 8 bytes of the digest, same as before.
    const val: number[] = []
    consumeDigest(digest.slice(9, 16), val)

    exponent -= leadingZeros
    // Left-shift away leading zeros in significand.
    significand.splice(0, leadingZeros)

    // Right-shift val by 64 minus leading zeros and push into significand.
    val.splice(64 - leadingZeros)
    significand = significand.concat(val)
  }

  // Flip 64th bit
  significand[63] = significand[63] === 0 ? 1 : 0

  // Convert our manual binary into a JS num (binary arr => binary string => psuedo-int) and run the ldexp!
  return (
    ldexp(parseInt(significand.join(''), 2), exponent) < config.sample!.percent
  )
}

// Array byte filler helper
function consumeDigest(digest: number[], arr: number[]) {
  for (let i = 0; i < 8; i++) {
    let remainder = digest[i]
    for (let binary = 128; binary >= 1; binary /= 2) {
      if (remainder - binary >= 0) {
        remainder -= binary
        arr.push(1)
      } else {
        arr.push(0)
      }
    }
  }
}

function ldexp(x: number, exp: number) {
  return x * Math.pow(2, exp)
}
