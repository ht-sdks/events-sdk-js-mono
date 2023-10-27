/// <reference types="@cloudflare/workers-types" />
import { Analytics } from '@ht-sdks/events-sdk-js-node'

export default {
  fetch(_request: Request, _env: {}, _ctx: ExecutionContext) {
    const analytics = new Analytics({
      writeKey: '__TEST__',
      host: 'http://localhost:3000',
    })

    analytics.track({ userId: 'some-user', event: 'some-event' })
    return new Response('ok')
  },
}
