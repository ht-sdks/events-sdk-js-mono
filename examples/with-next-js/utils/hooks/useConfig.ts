import { useLocalStorage } from './useLocalStorage'

export const useWriteKey = () =>
  useLocalStorage(
    'segment_playground_write_key',
    process.env.NEXT_PUBLIC_WRITEKEY
  )

export const useCDNUrl = () =>
  useLocalStorage('segment_playground_cdn_url', 'https://cdn.segment.com')

export const useApiHost = () =>
  useLocalStorage('segment_api_host', 'us-east-1.hightouch-events.com')

export const useApiProtocol = () =>
  useLocalStorage('segment_api_protocol', 'https')

export const useDelivery = () => useLocalStorage('segment_delivery', 'batching')
