type CSPErrorEvent = SecurityPolicyViolationEvent & {
  disposition?: 'enforce' | 'report'
}
export const isAnalyticsCSPError = (e: CSPErrorEvent) => {
  return (
    e.disposition !== 'report' && e.blockedURI.includes('cdn.hightouch-events')
  )
}
