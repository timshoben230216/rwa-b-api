# Sentinel

A minimal API service + monitoring dashboard, built to deploy on Vercel.

## Why one Next.js app instead of separate frontend/backend

Vercel's whole model is serverless functions + static/SSR frontend deployed
together from one project — that's what App Router API routes give you.
A standalone Express server would need to run as a single catch-all
serverless function anyway (Vercel doesn't run long-lived Node processes),
so you'd get all the downsides (cold starts, no persistent memory between
requests, need to configure `vercel.json` rewrites) with none of the
upside. Splitting frontend/backend into two projects would also mean
handling CORS and two deployments for no real benefit here. So: one
Next.js app, API routes under `app/api/*`, dashboard under `app/dashboard`.

The one consequence of "serverless functions have no memory between
requests" is that request logs and the block list **must** live in an
external store, not a JS array in memory — see below.

## Setup

1. `npm install`
2. Add a **Redis** storage integration to your project (Vercel dashboard →
   Storage → Marketplace → Upstash Redis, or `vercel install upstash`).
   This is what request logs and the block list are stored in. It
   auto-injects `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` into
   your project's env vars — you don't set them by hand. (Vercel's old
   built-in "KV" product is deprecated; this Marketplace integration is
   its replacement, and `lib/store.js` uses the `@upstash/redis` client,
   which reads either naming automatically.)
3. **Required:** set `DASHBOARD_PASSWORD` in your Vercel project's
   environment variables (or `.env.local` for local dev) to
   password-protect `/dashboard` and the admin API routes (`/api/records`,
   `/api/block`, `/api/unblock`, `/api/blocklist`, `/api/payload`). This
   is not optional — if it's unset, those routes fail closed with a 500
   telling you to set it, rather than being left open.
4. `vercel deploy` (or connect the repo in the Vercel dashboard).

For local dev, run `vercel dev` instead of `next dev` so the KV env vars
get pulled down from your linked Vercel project (`vercel link` first).
Either way, remember that changing env vars requires a restart
(`next dev`/`vercel dev`) or a redeploy (Vercel) to take effect.

## How it works

- **`GET/POST /api/v1`** — the public endpoint. For every hit it, in order:
  1. Reads the caller's IP (`x-forwarded-for`) and checks the **IP block
     list** first.
  2. Looks up geo + hosting/proxy signal via ip-api.com and classifies the
     request with `lib/detect.js`. Types: `browser` (real, unflagged
     browser traffic), `normal` (axios/node-fetch/go-http-client-style
     scripts), `postman`, `insomnia`, `python`, `curl`, `wget`, `httpie`,
     `vps` (datacenter IP, via ip-api's `hosting` flag), `proxy`,
     `no-user-agent`, `unknown-bot`.
  3. Checks the **ISP block list** against the caller's ISP name (e.g.
     `"Amazon.com, Inc."` for AWS) — case-insensitive, whitespace-trimmed
     match. Seeded with `"Amazon.com, Inc."` by default; add more from
     the dashboard's ISP Block List tab.
  4. If the type is `curl`, `vps`, or `postman` and the caller isn't
     already blocked (by IP or ISP), it's blocked immediately, by IP
     (`lib/detect.js`'s `AUTO_BLOCK_TYPES`).
  5. Logs the record (IP, geo, type, blocked/auto-blocked/isp-blocked
     flags, timestamp) to Redis — every hit is logged regardless of
     outcome.
  6. Response: if the caller is blocked (by IP, by ISP, or just
     auto-blocked), or "force default" mode is on, or the type isn't
     `browser` — responds with the **default response**. Otherwise
     responds with the **browser response**.

- **`GET/POST /api/payload`** — read/update the **browser response**: the
  JSON body `/api/v1` returns to real, unflagged browser traffic. A fresh
  `timestamp` field is added automatically on every response. Editable
  from the dashboard's **Response** tab, or directly:
  ```bash
  curl -X POST https://your-app.vercel.app/api/payload \
    -H "Content-Type: application/json" \
    -d '{"status":"ok","message":"new message"}'
  ```

- **`GET/POST /api/default-payload`** — read/update the **default
  response**: what's returned to blocked callers, flagged automated
  traffic, and everyone when force-default mode is on. Empty (`{}`) until
  you change it. Also editable from the **Response** tab.

- **`GET/POST /api/force-default`** — a manual kill switch. When on,
  every caller of `/api/v1` gets the default response, full stop —
  regardless of IP, ISP, block status, or detected type. Toggled from the
  banner at the top of the dashboard (`{"enabled": true/false}`).

- **`GET /api/records`** — last 200 logged requests, polled by the
  dashboard every 3s.

- **`GET /api/blocklist`**, **`POST /api/block`**, **`POST /api/unblock`**
  — manage the **IP** block list. Body: `{"ip": "1.2.3.4"}`.

- **`GET /api/isp-blocklist`**, **`POST /api/isp-block`**,
  **`POST /api/isp-unblock`** — manage the **ISP** block list, separate
  from the IP list. Body: `{"isp": "Amazon.com, Inc."}`. This is seeded
  with `"Amazon.com, Inc."` automatically the first time it's read — you
  don't need to add it yourself. Unblocking a seeded entry sticks (it
  won't silently come back).

- **`/dashboard`** — a force-default banner always visible at the top,
  plus a tabbed UI (Requests / IP Block List / ISP Block List / Response)
  below it. Polls for new records and shows a toast + a short beep + a
  flash on the "live traffic" strip when a new request comes in.
  Block/unblock happens inline from the Requests table (separate "Block
  IP" and "Block ISP" buttons per row) or from either block-list tab;
  auto-blocked requests are marked "(auto)" and ISP-blocked requests show
  an "ISP blocked" tag next to the ISP name. The Response tab has two
  editors — one for the browser response, one for the default response.

## Notes on the detection approach

- IP → hosting/proxy lookup uses the free tier of ip-api.com (45 req/min,
  HTTP only — fine for a server-to-server call). Swap `lib/geo.js` for a
  paid provider (ipinfo.io, MaxMind, IPQualityScore) if you need higher
  volume or a stricter proxy/VPN signal — IPQualityScore in particular
  gives a much stronger VPN/VPS confidence score if false
  positives/negatives on that front matter to you.
- This is a request-shape heuristic, not a hard security boundary — a
  determined caller can spoof a browser User-Agent from a residential
  proxy and get through. It's meant to filter casual API testing tools
  and obvious datacenter traffic, not to stop a motivated attacker.

## Real-time notifications: why polling, not WebSockets

Vercel's serverless functions don't hold a persistent connection between
requests, so a normal WebSocket server doesn't fit here. The dashboard
polls `/api/records` every 3 seconds and diffs against what it's already
seen — simple, and reliable on a serverless host. If you want sub-second
push updates, swap in Vercel's Edge Config + a service like Pusher/Ably,
or Vercel's own real-time primitives, but for a monitoring dashboard a
3s poll is imperceptible in practice.
