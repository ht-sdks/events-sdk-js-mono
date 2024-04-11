**These server examples should not be used as is. They should be adapted to your setup and "productionized".**

An example HTTPCookieService written in Node.js/Express.js:

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

app.listen(process.env.PORT || 3000, () => {
  console.log(`Listening on port ${process.env.PORT}...`);
});
```

The HTTPCookieService must live on the same domain and IP address as your website's HTML document.

As one way to accomplish this, you could have NGINX both serve your HTML document and forward requests to the Node.js/Express server.

An **overly simplified** NGINX reverse proxy:
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
