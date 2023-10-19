export function extractWriteKeyFromUrl(url: string): string | undefined {
  const matches = url.match(
    /https:\/\/cdn.hightouch-events.com\/v1\/projects\/(.+)\/settings/
  )

  if (matches) {
    return matches[1]
  }
}
