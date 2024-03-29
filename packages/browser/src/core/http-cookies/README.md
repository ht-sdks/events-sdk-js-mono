# HTTPOnly Cookies

## "Browser Cookies" vs "Server Cookies"

**Cookies are serialized sets of key-value pairs that the browser can send to the server when making an HTTP request (e.g. on the `Cookie` header)**. Traditionally, the browser does this to identify itself when calling the server. For example, it might receive a cookie when calling a `/login` route, and then continue to send this cookie on subsequent requests, proving that the user is still logged-in. Alternatively, browsers can use cookies just for storing local data, like localStorage.

Normally, **both** the client and the server can CRUD cookies.

However, as a security measure, browsers restrict Javascript access to cookies containing the `HTTPOnly` property. These cookies are **only** intended to be created and read by the server.

## "Browser Cookies" for event attribution

Certain browsers (e.g. Safari) limit "Browser Cookies" to a 7 day expiry.

A user visiting a website on both 01/01/2023 and 01/14/2023 will look like two different users. The browser will delete the user's "anonymousId cookie" before the user begins their second session on 01/14/2023.

## "Server Cookies" for event attribution

These expiry limits don't have to apply to "Server Cookies".

A user visiting a website on both 01/01/2023 and 01/14/2023 can still look like the same user, provided that there is a way to "regenerate" the user's same "anonymousId cookie" from the earlier session. To do this, the following must happen:
1. User begins their session on 01/01/2023
1. Events SDK creates an anonymousId "browser cookie"
1. Events SDK sends "browser cookie" to `$server` and receives back an HTTPOnly cookie with the same anonymousId
1. HTTPOnly cookie remains on the user's device
1. User begins their second session on 01/14/2023
1. Events SDK sends the HTTPOnly cookie to `$server` and receives back a "browser cookie" with the same anonymousId as the first session

**The `$server` must be the same server that serves your website.** Certain browsers (e.g. Safari) will still enforce a 7 day expiry--even for "server cookies"--unless the following criteria are met:
1. The `$server` providing the HTTPOnly cookie must be on the same domain as the website.
1. If `$server` is on a subdomain of the website, its IP address must match the IP address that served the main HTML document.

Routing a subdomain via DNS will not suffice. You'll need **one of** the following:
- A **webserver** that serves  both your HTML document and a programamtic API (e.g. something like Django, Rails, Spring, etc)
- A **reverse proxy** that can forward requests for your HTML document to one place, your API requests to another, and make it look like it's all on one server (e.g. NGINX, Caddy, etc)
- A **CDN** that can run programmatic logic when matching certain requests (e.g. Lambda@Edge, Clouflare Workers, etc)

## Client SDK Setup

```javascript
import { HtEventsBrowser } from '@ht-sdks/events-sdk-js-browser'

const htevents = HtEventsBrowser.load(
  { writeKey: '<YOUR_WRITE_KEY>'},
  { 
    apiHost: "us-east-1.hightouch-events.com", // HtEvents API remains the same
    httpCookieServiceOptions: {
      clearUrl: 'ht/clear', // route hosted on *your* domain and infra
      renewUrl: 'ht/renew', // route hosted on *your* domain and infra
    }
  },
)

htevents.identify('hello world')

document.body?.addEventListener('click', () => {
  htevents.track('document body clicked!')
})
```

## Server Setup

The Events SDK expects to interact with a customer's `$server` that implements a specific spec for two routes. You can name the endpoints whatever you want.

### An API for **creating** server and browser cookies

This route should look for the following **browser** cookies (from Events SDK):
* `request.headers.get('Cookie')["htjs_anonymous_id"]`
* `request.headers.get('Cookie')["htjs_user_id"]`

This route should return these values as **server** cookies:
* `response.cookie("htjs_anonymous_id_srvr", anonVal, {httpOnly:true, ...})`
* `response.cookie("htjs_user_id_srvr", userIdVal, {httpOnly:true, ...})`

If there are no browser cookies found, return any server cookies as browser cookies:
* `response.cookie("htjs_anonymous_id", anonVal, ...)`
* `response.cookie("htjs_user_id", userIdVal, ...)`

### An API for **clearing** server cookies

This route should look for **server** cookies and clean them:
* `res.cookie("htjs_anonymous_id_srvr", "", {maxAge: 0, httpOnly:true});`
* `res.cookie("htjs_user_id_srvr", "", {maxAge: 0, httpOnly:true});`

### API Spec
The spec of the actual `request` and `response` payloads are kept intentionally vague. The spec should fit a variety of server environments.

The Events SDK only requires that the server: A) handles cookies and B) returns a `200` statuscode.

## Server Example

A simplified Node.js/Express server:

```Javascript
const express = require("express");
const cookieParser = require('cookie-parser');
const cors = require('cors');

const USER_COOKIE = "htjs_user_id";
const ANON_COOKIE = "htjs_anonymous_id";

function getDomain(req) {
  let domain = process.env.DOMAIN || req.headers["x-forwarded-for"] || req.get("host");
  if (domain.startsWith("localhost")) return "localhost";
  return domain;
}

function renewCookies(req, res, browserName, serverName) {
  const cookie = req.cookies[browserName] || req.cookies[serverName];
  if (!cookie) return "";
  const cookieParams = {maxAge:31536000*1000, domain: getDomain(req), sameSite: "lax"};
  res.cookie(browserName, cookie, {...cookieParams});
  res.cookie(serverName, cookie, {...cookieParams, httpOnly:true});
  return cookie;
}

function clearServerCookie(req, res, serverName) {
  const cookie = "";
  const cookieParams = {maxAge:0, domain: getDomain(req), sameSite: "lax"};
  res.cookie(serverName, "", {...cookieParams, httpOnly:true});
  return cookie;
}

const app = express();
app.use(cookieParser());
app.use(cors())

app.post("/ht/renew", (req, res) => {
  // recreate a browser cookie from an existing server cookie, OR
  // create a new server cookie that can later be used to recreate from.
  return res.json({
    userId: renewCookies(req, res, USER_COOKIE, `${USER_COOKIE}_srvr`),
    anonymousId: renewCookies(req, res, ANON_COOKIE, `${ANON_COOKIE}_srvr`),
  })
});

app.post("/ht/clear", (req, res) => {
  // clear server cookies, e.g. if the user asks to clear all cookies.
  return res.json({
    userId: clearServerCookie(req, res, `${USER_COOKIE}_srvr`),
    anonymousId: clearServerCookie(req, res, `${ANON_COOKIE}_srvr`),
  })
});

app.listen(3000, () => {
  console.log("Listening on port 3000...");
});
```

A **very** simplified NGINX reverse proxy serving your document and API from the same domain:
```
worker_processes  1;

events {
    worker_connections  1024;
}

http {
    default_type  application/octet-stream;
    sendfile        on;
    keepalive_timeout  65;

    server {
        listen       8080;
        server_name  localhost;

        location / {
            root   /Users/name/src/website/html;
            index  index.html index.htm;
        }

        location /cdn {
            #autoindex on;
            alias  /Users/name/src/website/cdn;
            try_files $uri /index.html =404;
        }

        location /ht {
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header Host $host;
            proxy_pass http://127.0.0.1:3000;
        }

    }

    include servers/*;
}
```

**These server examples should not be used as is.** They should be adapted to your setup and "productionized". The general concepts remain the same though.

## More information
- Safari: https://webkit.org/blog/9521/intelligent-tracking-prevention-2-3/

