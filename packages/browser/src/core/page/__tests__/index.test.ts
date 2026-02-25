import {
  BufferedPageContextDiscriminant,
  getDefaultBufferedPageContext,
  getDefaultPageContext,
  isBufferedPageContext,
  addPageContext,
} from '../'
import { pickBy } from 'lodash'
import { HightouchEvent } from '../../events'

const originalLocation = window.location
beforeEach(() => {
  Object.defineProperty(window, 'location', {
    value: {
      ...originalLocation,
    },
    writable: true,
  })
})

describe(isBufferedPageContext, () => {
  it('should return true if object is page context', () => {
    expect(isBufferedPageContext(getDefaultBufferedPageContext())).toBe(true)
  })
  it('should return false if object is not page context', () => {
    expect(isBufferedPageContext(undefined)).toBe(false)
    expect(isBufferedPageContext({})).toBe(false)
    expect(isBufferedPageContext('')).toBe(false)
    expect(isBufferedPageContext({ foo: false })).toBe(false)
    expect(isBufferedPageContext({ u: 'hello' })).toBe(false)
    expect(isBufferedPageContext(null)).toBe(false)

    expect(
      isBufferedPageContext({
        ...getDefaultBufferedPageContext(),
        some_unknown_key: 123,
      })
    ).toBe(false)

    const missingDiscriminant = pickBy(
      getDefaultBufferedPageContext(),
      (v) => v !== BufferedPageContextDiscriminant
    )
    // should not be missing the dscriminant
    expect(isBufferedPageContext(missingDiscriminant)).toBe(false)
  })
})

describe(getDefaultPageContext, () => {
  describe('hash', () => {
    it('strips the hash from the URL', () => {
      window.location.href = 'http://www.hightouch.local#test'
      const defs = getDefaultPageContext()
      expect(defs.url).toBe('http://www.hightouch.local')

      window.location.href = 'http://www.hightouch.local/#test'
      const defs2 = getDefaultPageContext()
      expect(defs2.url).toBe('http://www.hightouch.local/')
    })
  })

  describe('canonical URL', () => {
    const el = document.createElement('link')
    beforeEach(() => {
      el.setAttribute('rel', 'canonical')
      el.setAttribute('href', '')
      document.clear()
    })

    it('returns location.href if canonical URL does not exist', () => {
      el.setAttribute('rel', 'nope')
      document.body.appendChild(el)
      const defs = getDefaultPageContext()
      expect(defs.url).toEqual(window.location.href)
    })

    it('does not throw an error if canonical URL is not a valid URL', () => {
      el.setAttribute('href', 'foo.com/bar')
      document.body.appendChild(el)
      const defs = getDefaultPageContext()
      expect(defs.url).toEqual('foo.com/bar') // this is analytics.js classic behavior
      expect(defs.path).toEqual('/foo.com/bar') // this is analytics.js classic behavior
    })

    it('handles a leading slash', () => {
      el.setAttribute('href', 'foo')
      document.body.appendChild(el)
      const defs = getDefaultPageContext()
      expect(defs.url).toEqual('foo')
      expect(defs.path).toEqual('/foo') // this is analytics.js classic behavior
    })

    it('handles canonical links', () => {
      el.setAttribute('href', 'http://www.hightouch.local')
      document.body.appendChild(el)
      const defs = getDefaultPageContext()
      expect(defs.url).toEqual('http://www.hightouch.local')
    })

    it('favors canonical path over location.pathname', () => {
      window.location.pathname = '/nope'
      el.setAttribute('href', 'http://www.hightouch.local/test')
      document.body.appendChild(el)
      const defs = getDefaultPageContext()
      expect(defs.path).toEqual('/test')
    })

    it('handles canonical links with a path', () => {
      el.setAttribute('href', 'http://www.hightouch.local/test')
      document.body.appendChild(el)
      const defs = getDefaultPageContext()
      expect(defs.url).toEqual('http://www.hightouch.local/test')
      expect(defs.path).toEqual('/test')
    })

    it('handles canonical links with search params in the url', () => {
      el.setAttribute('href', 'http://www.hightouch.local?test=true')
      document.body.appendChild(el)
      const defs = getDefaultPageContext()
      expect(defs.url).toEqual('http://www.hightouch.local?test=true')
    })

    it('will add search params from the document to the canonical path if it does not have search params', () => {
      // This seems like weird behavior to me, but I found it in the codebase so adding a test for it.
      window.location.search = '?foo=123'
      el.setAttribute('href', 'http://www.hightouch.local')
      document.body.appendChild(el)
      const defs = getDefaultPageContext()
      expect(defs.url).toEqual('http://www.hightouch.local?foo=123')
    })
  })
})

describe(addPageContext, () => {
  const mockPageCtx = {
    path: '/default-path',
    referrer: 'https://example.com/referrer',
    search: '',
    title: 'Test Page',
    url: 'https://example.com/default-path',
  }

  describe('path derivation from user-provided url', () => {
    it('derives path from url when user provides url but not path', () => {
      const event: HightouchEvent = {
        type: 'page',
        properties: {
          url: 'https://example.com/new-path',
          referrer: 'https://example.com/previous-path',
        },
        context: {},
      }

      addPageContext(event, mockPageCtx)

      expect(event.properties?.path).toBe('/new-path')
      expect(event.context?.page?.path).toBe('/new-path')
    })

    it('preserves user-provided path when both url and path are provided', () => {
      const event: HightouchEvent = {
        type: 'page',
        properties: {
          url: 'https://example.com/url-path',
          path: '/explicit-path',
        },
        context: {},
      }

      addPageContext(event, mockPageCtx)

      expect(event.properties?.path).toBe('/explicit-path')
      expect(event.context?.page?.path).toBe('/explicit-path')
    })

    it('uses default path when user does not provide url', () => {
      const event: HightouchEvent = {
        type: 'page',
        properties: {
          referrer: 'https://example.com/previous-path',
        },
        context: {},
      }

      addPageContext(event, mockPageCtx)

      expect(event.properties?.path).toBe('/default-path')
      expect(event.context?.page?.path).toBe('/default-path')
    })

    it('handles complex paths with query strings', () => {
      const event: HightouchEvent = {
        type: 'page',
        properties: {
          url: 'https://example.com/products/shoes?color=red&size=10',
        },
        context: {},
      }

      addPageContext(event, mockPageCtx)

      expect(event.properties?.path).toBe('/products/shoes')
      expect(event.context?.page?.path).toBe('/products/shoes')
    })

    it('handles urls with hash fragments', () => {
      const event: HightouchEvent = {
        type: 'page',
        properties: {
          url: 'https://example.com/page#section',
        },
        context: {},
      }

      addPageContext(event, mockPageCtx)

      expect(event.properties?.path).toBe('/page')
      expect(event.context?.page?.path).toBe('/page')
    })

    it('does not modify path for non-page events', () => {
      const event: HightouchEvent = {
        type: 'track',
        event: 'Test Event',
        properties: {
          url: 'https://example.com/some-path',
        },
        context: {},
      }

      addPageContext(event, mockPageCtx)

      // For track events, context.page should use defaults, not derive from properties
      expect(event.context?.page?.path).toBe('/default-path')
    })

    it('handles invalid url gracefully', () => {
      const event: HightouchEvent = {
        type: 'page',
        properties: {
          url: 'not-a-valid-url',
        },
        context: {},
      }

      addPageContext(event, mockPageCtx)

      // Should fall back to default path when url is invalid
      expect(event.properties?.path).toBe('/default-path')
      expect(event.context?.page?.path).toBe('/default-path')
    })

    it('handles url with encoded characters', () => {
      const event: HightouchEvent = {
        type: 'page',
        properties: {
          url: 'https://example.com/path%20with%20spaces',
        },
        context: {},
      }

      addPageContext(event, mockPageCtx)

      expect(event.properties?.path).toBe('/path%20with%20spaces')
      expect(event.context?.page?.path).toBe('/path%20with%20spaces')
    })
  })
})
