import { fetch } from '../../lib/fetch'

export type DeliveryCallback = (request: Promise<Response>) => Promise<unknown>
export type Dispatcher = (
  url: string,
  body: object,
  onDelivery?: DeliveryCallback
) => Promise<unknown>

export type StandardDispatcherConfig = {
  keepalive?: boolean
}

export default function (config?: StandardDispatcherConfig): {
  dispatch: Dispatcher
} {
  const dispatch: Dispatcher = (url, body, onDelivery) => {
    const request = fetch(url, {
      keepalive: config?.keepalive,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      method: 'post',
      body: JSON.stringify(body),
    })
    return onDelivery ? onDelivery(request) : request
  }

  return {
    dispatch,
  }
}
