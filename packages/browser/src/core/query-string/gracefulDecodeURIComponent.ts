/**
 * Tries to gets the unencoded version of an encoded component of a
 * Uniform Resource Identifier (URI). If input string is malformed,
 * returns it back as-is.
 *
 * Note: All occurences of the `+` character become ` ` (spaces).
 **/
export function gracefulDecodeURIComponent(
  encodedURIComponent: string
): string {
  try {
    return decodeURIComponent(encodedURIComponent.replace(/\+/g, ' '))
  } catch {
    return encodedURIComponent
  }
}

/**
 * Repeatedly decodes a URI component until it no longer changes.
 * This handles multi-encoded strings that have been URL-encoded multiple
 * times through redirect chains or tracking systems.
 *
 * Limits iterations to prevent infinite loops on malformed input.
 **/
export function fullyDecodeURIComponent(encodedURIComponent: string): string {
  let prev: string | undefined
  let decoded = encodedURIComponent
  let iterations = 0
  const maxIterations = 10

  while (decoded !== prev && iterations < maxIterations) {
    prev = decoded
    decoded = gracefulDecodeURIComponent(decoded)
    iterations++
  }

  return decoded
}
