**These server examples should not be used as is. They should be adapted to your setup and "productionized".**

An example HTTPCookieService written as a Next.js API Route.

```Javascript
import type { NextApiRequest, NextApiResponse } from "next";

const USER_COOKIE = "htjs_user_id";
const ANON_COOKIE = "htjs_anonymous_id";

function getDomain(request: NextApiRequest) {
  const domain = request.headers.host?.toString() ?? "";
  if (domain.startsWith("localhost")) return "localhost";
  return domain;
}

function renewCookies(request: NextApiRequest, response: NextApiResponse, browserName: string, serverName: string) {
  const cookie = request.cookies[browserName] ?? request.cookies[serverName];
  if (!cookie) return "";
  const maxAge = 31_536_000; // 1 year in seconds
  const domain = getDomain(request);
  response.setHeader("Set-Cookie", [
    ...((response.getHeader("Set-Cookie") as string[]) ?? []),
    `${browserName}=${cookie}; Max-Age=${maxAge}; Domain=${domain}; Path=/; SameSite=Lax;`,
    `${serverName}=${cookie}; Max-Age=${maxAge}; Domain=${domain}; Path=/; SameSite=Lax; httpOnly=true;`,
  ]);
  return cookie;
}

function clearServerCookie(request: NextApiRequest, response: NextApiResponse, serverName: string) {
  const cookie = "";
  const maxAge = 0;
  const domain = getDomain(request);
  response.setHeader("Set-Cookie", [
    ...((response.getHeader("Set-Cookie") as string[]) ?? []),
    `${serverName}=${cookie}; Max-Age=${maxAge}; Domain=${domain}; Path=/; SameSite=Lax; httpOnly;`,
  ]);
  return cookie;
}

export default function handler(request: NextApiRequest, response: NextApiResponse) {
  if (request.method?.toUpperCase() !== "POST") {
    response.status(404);
    response.end();
    return;
  }

  const slug = (request.query.slug as string).toLowerCase();

  if (slug === "renew") {
    response.status(200);
    response.json({
      userId: renewCookies(request, response, USER_COOKIE, `${USER_COOKIE}_srvr`),
      anonymousId: renewCookies(request, response, ANON_COOKIE, `${ANON_COOKIE}_srvr`),
    });
  } else if (slug === "clear") {
    response.status(200);
    response.json({
      userId: clearServerCookie(request, response, `${USER_COOKIE}_srvr`),
      anonymousId: clearServerCookie(request, response, `${ANON_COOKIE}_srvr`),
    });
  } else {
    response.status(404);
    response.end();
  }
}
```

The HTTPCookieService must live on the same domain and IP address as your website's HTML document.

As one way to accomplish this, you could create one Next.js project to serve both your HTML site and your API.

The above example code might live at `src/pages/api/ht/[slug].ts`, while your other non-API pages might live somewhere like `src/pages/blog/index.tsx`.

See [Next.js](https://nextjs.org/docs) for more information.
