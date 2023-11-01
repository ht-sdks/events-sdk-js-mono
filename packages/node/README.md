# @ht-sdks/events-sdk-js-node

https://www.npmjs.com/package/@ht-sdks/events-sdk-js-node


## Runtime Support
- Node.js >= 14
- AWS Lambda
- Cloudflare Workers
- Vercel Edge Functions
- Web Workers (experimental)

## Quick Start
### Install library
```bash
# npm
npm install @ht-sdks/events-sdk-js-node
# yarn
yarn add @ht-sdks/events-sdk-js-node
# pnpm
pnpm install @ht-sdks/events-sdk-js-node
```

### Usage
Assuming some express-like web framework.
```ts
import { HtEvents } from '@ht-sdks/events-sdk-js-node'
// or, if you use require:
const { HtEvents } = require('@ht-sdks/events-sdk-js-node')

// instantiation
const htevents = new HtEvents({ writeKey: '<MY_WRITE_KEY>' })

app.post('/login', (req, res) => {
   htevents.identify({
      userId: req.body.userId,
      previousId: req.body.previousId
  })
  res.sendStatus(200)
})

app.post('/cart', (req, res) => {
  htevents.track({
    userId: req.body.userId,
    event: 'Add to cart',
    properties: { productId: '123456' }
  })
   res.sendStatus(201)
});
```


## Settings & Configuration

You can also see the complete list of settings in the [HtEventsSettings interface](src/app/settings.ts).


## Usage in non-node runtimes
### Usage in AWS Lambda
- [AWS lambda execution environment](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html) is challenging for typically non-response-blocking async activites like tracking or logging, since the runtime terminates / freezes after a response is emitted.

Here is an example of using HtEvents within a handler:
```ts
const { HtEvents } = require('@ht-sdks/events-sdk-js-node');

// since analytics has the potential to be stateful if there are any plugins added,
// to be on the safe side, we should instantiate a new instance of analytics on every request (the cost of instantiation is low).
const htevents = () => new HtEvents({
      maxEventsInBatch: 1,
      writeKey: '<MY_WRITE_KEY>',
    })
    .on('error', console.error);

module.exports.handler = async (event) => {
  ...
  // we need to await before returning, otherwise the lambda will exit before sending the request.
  await new Promise((resolve) =>
    htevents().track({ ... }, resolve)
   )

  ...
  return {
    statusCode: 200,
  };
  ....
};
```

### Usage in Vercel Edge Functions
```ts
import { HtEvents } from '@ht-sdks/events-sdk-js-node';
import { NextRequest, NextResponse } from 'next/server';

export const htevents = new HtEvents({
  writeKey: '<MY_WRITE_KEY>',
  maxEventsInBatch: 1,
})
  .on('error', console.error)

export const config = {
  runtime: 'edge',
};

export default async (req: NextRequest) => {
  await new Promise((resolve) =>
    htevents.track({ ... }, resolve)
  );
  return NextResponse.json({ ... })
};
```

### Usage in Cloudflare Workers
```ts
import { HtEvents, Context } from '@ht-sdks/events-sdk-js-node';

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const htevents = new HtEvents({
      maxEventsInBatch: 1,
      writeKey: '<MY_WRITE_KEY>',
    }).on('error', console.error);

    await new Promise((resolve, reject) =>
      htevents.track({ ... }, resolve)
    );

    ...
    return new Response(...)
  },
};

```


