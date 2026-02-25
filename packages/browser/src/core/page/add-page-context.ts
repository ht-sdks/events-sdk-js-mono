import { pick } from '../../lib/pick'
import { EventProperties, HightouchEvent } from '../events'
import { getDefaultPageContext } from './get-page-context'

/**
 * Parses the path from a URL string.
 * Returns undefined if the URL is invalid.
 */
const parsePathFromUrl = (url: string): string | undefined => {
  try {
    return new URL(url).pathname
  } catch (_e) {
    return undefined
  }
}

/**
 * Augments an event with information about the current page.
 * Page information like URL changes frequently, so this is meant to be captured as close to the event call as possible.
 * Things like `userAgent` do not change, so they can be added later in the flow.
 * We prefer not to add this information to this function, as it increases the main bundle size.
 */
export const addPageContext = (
  event: HightouchEvent,
  pageCtx = getDefaultPageContext()
): void => {
  const evtCtx = event.context! // Context should be set earlier in the flow
  let pageContextFromEventProps: Pick<EventProperties, string> | undefined
  let derivedPath: string | undefined

  if (event.type === 'page') {
    pageContextFromEventProps =
      event.properties && pick(event.properties, Object.keys(pageCtx))

    // If user provided url but not path, derive path from the url.
    // This is important for SPAs where the url may be manually set but path
    // would otherwise be auto-detected from location.pathname which may be stale.
    if (pageContextFromEventProps) {
      const userUrl = pageContextFromEventProps['url']
      const userPath = pageContextFromEventProps['path']
      if (userUrl && typeof userUrl === 'string' && !userPath) {
        derivedPath = parsePathFromUrl(userUrl)
        if (derivedPath) {
          pageContextFromEventProps = {
            ...pageContextFromEventProps,
            path: derivedPath,
          }
        }
      }
    }

    event.properties = {
      ...pageCtx,
      ...event.properties,
      ...(derivedPath ? { path: derivedPath } : {}),
      ...(event.name ? { name: event.name } : {}),
    }
  }

  evtCtx.page = {
    ...pageCtx,
    ...pageContextFromEventProps,
    ...evtCtx.page,
  }
}
