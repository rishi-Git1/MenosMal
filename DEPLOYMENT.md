# MenosMal deployment guide for `rmal.linkpc.net`

This app includes a Node server and file persistence (`data/entries.json`), so deploy it to a host with **persistent disk**.

## 1) Recommended host settings (Render or Railway)

- Build command: `npm install`
- Start command: `npm start`
- Node version: current LTS (or latest stable)
- Persistent disk/volume mount path: project root `data/`

### Required environment variables

- `PORT` (provided automatically by most platforms)
- `CANONICAL_HOST=rmal.linkpc.net`
- `ENFORCE_HTTPS=true`

> `CANONICAL_HOST` and `ENFORCE_HTTPS` are used by `server.js` to redirect non-canonical hostnames and non-HTTPS requests to `https://rmal.linkpc.net`.

## 2) Domain and DNS setup (`rmal.linkpc.net`)

Because you are using a subdomain, create DNS on the `linkpc.net` zone:

- Type: `CNAME`
- Name/Host: `rmal`
- Value/Target: your platform-provided hostname
  - Render example: `your-service.onrender.com`
  - Railway example: `your-app.up.railway.app`
- TTL: default

If your platform specifically asks for an `A` record instead, use the exact value provided by that platform.

## 3) Add custom domain in hosting dashboard

1. Open your deployed service.
2. Add custom domain: `rmal.linkpc.net`.
3. Wait until certificate/SSL status is active.

## 4) Verify deployment

After DNS/SSL propagate, check:

- `https://rmal.linkpc.net`
- `https://rmal.linkpc.net/api/health`

Expected health response:

```json
{"status":"ok"}
```

## 5) Operational notes

- Keep one instance unless you move to a database.
- Do not delete the mounted `data/` volume or you lose stored entries.
- Back up `data/entries.json` periodically.
