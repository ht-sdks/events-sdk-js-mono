**These server examples should not be used as is. They should be adapted to your setup and "productionized".**

An example HTTPCookieService written as an AWS Lambda Function:

```Javascript
const USER_COOKIE = "htjs_user_id";
const ANON_COOKIE = "htjs_anonymous_id";
const DOMAIN = "CHANGEME.example.com";

function renewCookies(request, response, browserName, serverName) {
  let cookie = request.cookies[browserName] ?? request.cookies[serverName];
  if (!cookie) return "";
  const maxAge = 31_536_000; // 1 year in seconds
  response.cookies= (response.cookies ?? []).concat([
    `${browserName}=${cookie}; Max-Age=${maxAge}; Domain=${DOMAIN}; Path=/; SameSite=Lax;`,
    `${serverName}=${cookie}; Max-Age=${maxAge}; Domain=${DOMAIN}; Path=/; SameSite=Lax; httpOnly=true;`,
  ]);
  return cookie;
}

function clearServerCookie(request, response, serverName) {
  const cookie = "";
  const maxAge = 0;
  response.cookies = (response.cookies ?? []).concat([
    `${serverName}=${cookie}; Max-Age=${maxAge}; Domain=${DOMAIN}; Path=/; SameSite=Lax; httpOnly;`,
  ]);
  return cookie;
}

function getCookies(reqCookies) {
  const cookies = {};
  if (!reqCookies) return cookies;
  for (const cookieStr of reqCookies) {
    const cookieArr = cookieStr.split("=");
    if (cookieArr.length == 1) {
      cookies[cookieArr[0]] = "";
    } else if (cookieArr.length == 2) {
      cookies[cookieArr[0]] = cookieArr[1]; 
    } else {
      console.log("cookieArr", cookieArr);
    }
  }
  return cookies;
}

export const handler = async (event, context) => {
  const request = {
    method: event.requestContext.http.method,
    path: event.pathParameters.proxy,
    headers: event.headers,
    cookies: getCookies(event.cookies),
  }
  const response = {
    statusCode: '200',
    headers: {
      "Content-Type": "application/json"
    },
    isBase64Encoded: false,
    multiValueHeaders: {},
    body: "{}",
  };
    
  if (request.method?.toUpperCase() !== "POST") {
    response.statusCode = 404;
    return response;
  }

  if (request.path === "renew") {
    const userId = renewCookies(request, response, USER_COOKIE, `${USER_COOKIE}_srvr`);
    const anonymousId = renewCookies(request, response, ANON_COOKIE, `${ANON_COOKIE}_srvr`);
    response.body = JSON.stringify({
      userId,
      anonymousId,
    })
  } else if (request.path === "clear") {
    const userId = clearServerCookie(request, response, `${USER_COOKIE}_srvr`);
    const anonymousId = clearServerCookie(request, response, `${ANON_COOKIE}_srvr`);
    response.body = JSON.stringify({
      userId,
      anonymousId,
    })
  } else {
    response.statusCode = 404;
  }
  return response;
};
```

After creating the above Lambda Function, you'll need to setup an [API Gateway](https://aws.amazon.com/api-gateway/). Specifically, create a new `Route` and input the value of `/ht/{proxy}`. Then attach an `integration` for this route, and select your Lambda. Your HTTPCookieService lambda will now be callable over HTTP at `${ApiGatewayURL}.com/default/ht/renew`.

However, the HTTPCookieService must live on the same domain and IP address as your website's HTML document.

As one way to accomplish this, you could use a CDN to front both your HTML document and your API Gateway. To do this, create a Cloudfront Distribution. Then create multiple origin configurations. One will have a `customOriginSource`, and a `pathPattern` of `/ht/*` pointing at your API Gateway's URL. The other origin configuration will point at an `s3OriginSource` if your HTML website is being hosted on S3. You would then configure your Web SDK to point at `/ht/renew` and `/ht/clear` for the HTTPCookieService routes.

---

Alternatively, if you simply want a "Hello World" example for a fully functioning HTTPCookieService, you can create two lambdas (one for HTML and another for HTTPCookieService), and put them both on the same API Gateway. You can then test against the API Gateway domain.

Example Lambda for HTML--to pair with the above Lambda. This only intended for testing and "Hello World" purposes:

```Javascript
const cdnDomain = "https://cdn.hightouch-events.com/browser/release/v1-latest/events.min.js";

const writeKey = "WRITE KEY";

const html = `
<head>
<script type="text/javascript">
!function(){var e=window.htevents=window.htevents||[];if(!e.initialize)if(e.invoked)window.console&&console.error&&console.error("Hightouch snippet included twice.");else{e.invoked=!0,e.methods=["trackSubmit","trackClick","trackLink","trackForm","pageview","identify","reset","group","track","ready","alias","debug","page","once","off","on","addSourceMiddleware","addIntegrationMiddleware","setAnonymousId","addDestinationMiddleware"],e.factory=function(t){return function(){var n=Array.prototype.slice.call(arguments);return n.unshift(t),e.push(n),e}};for(var t=0;t<e.methods.length;t++){var n=e.methods[t];e[n]=e.factory(n)}e.load=function(t,n){var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src="${cdnDomain}";var r=document.getElementsByTagName("script")[0];r.parentNode.insertBefore(o,r),e._loadOptions=n,e._writeKey=t},e.SNIPPET_VERSION="0.0.1",
e.load('${writeKey}',{
  apiHost:'us-east-1.hightouch-events.com',
  httpCookieServiceOptions: {clearUrl: 'default/ht/clear', renewUrl: 'default/ht/renew', backoff: 5000},
}),
e.page()}}();
</script>

</head>
<body>
  Hightouch
  <a href="#" onClick="(function(){
    htevents.identify(
      '123', {
        email: 'bob@hightouch.io'
      }, {},
      () => {
        console.log('identify call');
      }
    );
    })();return false;">identify
  </a>
  <br>
  <br>
  <a href="#" onClick="(function(){
    htevents.track(
      'clickEvent', {
        revenue: 30,
        currency: 'USD',
        user_actual_id: 123
      }, {},
      () => {
        console.log('track call');
      }
    );
    })();return false;">track
  </a>
  <br>
  <br>
    <a href="#" onClick="(function(){
    htevents.reset();
    htevents.identify('456', { email: 'george@hightouch.com'})
    })();return false;">reset
  </a>
</body>
`;

export const handler = async () => {
    const response = {
        statusCode: 200,
        headers: {
            'Content-Type': 'text/html',
        },
        body: html,
    };
    return response;
};

```