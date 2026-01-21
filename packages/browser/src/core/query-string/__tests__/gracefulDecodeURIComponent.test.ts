import {
  gracefulDecodeURIComponent,
  fullyDecodeURIComponent,
} from '../gracefulDecodeURIComponent'

describe('gracefulDecodeURIComponent', () => {
  it('decodes a properly encoded URI component', () => {
    const output = gracefulDecodeURIComponent(
      'brown+fox+jumped+%40+the+fence%3F'
    )

    expect(output).toEqual('brown fox jumped @ the fence?')
  })

  it('returns the input string back as-is when input is malformed', () => {
    const output = gracefulDecodeURIComponent('25%%2F35%')

    expect(output).toEqual('25%%2F35%')
  })
})

describe('fullyDecodeURIComponent', () => {
  it('decodes a singly encoded string', () => {
    const output = fullyDecodeURIComponent('%40')
    expect(output).toEqual('@')
  })

  it('decodes a double-encoded string', () => {
    // %2540 is %40 encoded again (%25 = %, so %2540 -> %40 -> @)
    const output = fullyDecodeURIComponent('%2540')
    expect(output).toEqual('@')
  })

  it('decodes a triple-encoded string', () => {
    // %252540 -> %2540 -> %40 -> @
    const output = fullyDecodeURIComponent('%252540')
    expect(output).toEqual('@')
  })

  it('handles multi-encoded ampersand from HTML entities', () => {
    // Common case: &amp; HTML entity that got URL-encoded multiple times
    // Original: &amp;utm_source -> %26amp%3Butm_source -> %2526amp%253Butm_source
    const output = fullyDecodeURIComponent('%2526amp%253Butm_source')
    expect(output).toEqual('&amp;utm_source')
  })

  it('handles deeply nested encoding (5+ levels)', () => {
    // Simulate redirect chains that encode multiple times
    let encoded = 'hello'
    for (let i = 0; i < 5; i++) {
      encoded = encodeURIComponent(encoded)
    }
    const output = fullyDecodeURIComponent(encoded)
    expect(output).toEqual('hello')
  })

  it('handles plus signs as spaces', () => {
    const output = fullyDecodeURIComponent('hello+world')
    expect(output).toEqual('hello world')
  })

  it('returns malformed input as-is without infinite loop', () => {
    // Malformed input with bare % signs
    const output = fullyDecodeURIComponent('25%%2F35%')
    expect(output).toEqual('25%%2F35%')
  })

  it('does not loop infinitely on stable input', () => {
    const output = fullyDecodeURIComponent('already decoded')
    expect(output).toEqual('already decoded')
  })
})
