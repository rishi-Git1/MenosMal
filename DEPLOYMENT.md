# MenosMal deployment guide for `rmal.linkpc.net`

This app now supports **two storage modes**:

1. **Local file mode** (`data/entries.json`) for paid hosts with persistent disk.
2. **GitHub-backed mode** (recommended for free hosting) that reads/writes `entries.json` in your repo via GitHub API.

---

## 1) Render service settings

- Build command: `npm install`
- Start command: `npm start`
- Node version: current LTS (or latest stable)

### Domain env vars

- `CANONICAL_HOST=www.rmal.linkpc.net`
- `ENFORCE_HTTPS=true`

> Use `www.rmal.linkpc.net` as canonical if only `www` is pointed at Render.

---

## 2) Free persistence mode (GitHub-backed)

Set these environment variables in Render:

- `STORAGE_BACKEND=github`
- `GITHUB_OWNER=<your-github-username>`
- `GITHUB_REPO=MenosMal`
- `GITHUB_BRANCH=main`
- `GITHUB_PATH=data/entries.json`
- `GITHUB_TOKEN=<fine-grained-token-with-contents-read-write>`

### Token scope

Create a fine-grained PAT that has **Contents: Read and Write** for this repository only.

### Initialize data file in repo

Create `data/entries.json` in your repo with:

```json
[]
```

The server will update this file through GitHub API on add/edit/delete.

---

## 3) DNS setup for your current provider

Because your provider keeps root host records constrained, use `www`:

- `CNAME` `www.rmal.linkpc.net` -> `menosmal.onrender.com`

Then add `www.rmal.linkpc.net` as the custom domain in Render.

---

## 4) Verify deployment

After deploy:

- `https://www.rmal.linkpc.net`
- `https://www.rmal.linkpc.net/api/health`

Expected health response:

```json
{"status":"ok"}
```

---

## 5) Operational notes

- With GitHub mode, data survives redeploys and free instance restarts.
- Never expose `GITHUB_TOKEN` to client-side code.
- If two writes happen at once, server retries once on SHA conflict.
