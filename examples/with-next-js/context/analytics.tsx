import React from 'react'
import { AnalyticsBrowser } from '@segment/analytics-next'
import {
  useApiHost,
  useApiProtocol,
  useCDNUrl,
  useDelivery,
  useWriteKey,
} from '../utils/hooks/useConfig'

const AnalyticsContext = React.createContext<{
  analytics: AnalyticsBrowser
  writeKey: string
  setWriteKey: (key: string) => void
  cdnURL: string
  setCDNUrl: (url: string) => void
  apiHost: string
  setApiHost: (url: string) => void
  apiProtocol: string
  setApiProtocol: (protocol: string) => void
  delivery: string
  setDelivery: (delivery: string) => void
}>(undefined)

export const AnalyticsProvider: React.FC = ({ children }) => {
  const [apiHost, setApiHost] = useApiHost()
  const [apiProtocol, setApiProtocol] = useApiProtocol()
  const [writeKey, setWriteKey] = useWriteKey()
  const [cdnURL, setCDNUrl] = useCDNUrl()
  const [delivery, setDelivery] = useDelivery()

  const analytics = React.useMemo(() => {
    console.log(
      `AnalyticsBrowser loading...`,
      JSON.stringify({ writeKey, delivery, apiProtocol, apiHost }, null, 4)
    )
    return AnalyticsBrowser.load({
      writeKey,
      cdnURL,
      cdnSettings: {
        integrations: {
          'Hightouch.io': {
            apiKey: writeKey,
            apiHost: apiHost,
            protocol: apiProtocol,
            deliveryStrategy:
              delivery == 'batching'
                ? {
                    strategy: 'batching',
                    config: { timeout: 30, size: 100 },
                  }
                : {
                    strategy: 'standard',
                    config: { keepalive: false },
                  },
          },
        },
      },
    })
  }, [writeKey, cdnURL, apiHost, apiProtocol, delivery])
  return (
    <AnalyticsContext.Provider
      value={{
        analytics,
        writeKey,
        setWriteKey,
        cdnURL,
        setCDNUrl,
        apiHost,
        setApiHost,
        apiProtocol,
        setApiProtocol,
        delivery,
        setDelivery,
      }}
    >
      {children}
    </AnalyticsContext.Provider>
  )
}

// Create an analytics hook that we can use with other components.
export const useAnalytics = () => {
  const result = React.useContext(AnalyticsContext)
  if (!result) {
    throw new Error('Context used outside of its Provider!')
  }
  return result
}
