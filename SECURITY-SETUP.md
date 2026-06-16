# World Cup 2026 Bet Tracker — Security Setup

This update moves **all secrets off the browser**. The page no longer contains your
jsonbin key, your football-data token, or the admin password. They live only in
Netlify environment variables and are used inside three serverless functions.

## What changed

| | Before | After |
|---|---|---|
| jsonbin key | in page source | only in `get-data` / `save-data` / `sync` functions |
| football-data token | in page source (sent from browser) | only in the `sync` function |
| admin password | `"admin2026"` hardcoded in JS | env var, checked server-side, entered at login |
| writes | anyone could PUT to your bin | only requests with the correct password |
| reads | every viewer hit jsonbin directly | one CDN-cached function read shared by all viewers |

## 1. File layout

```
your-repo/
├── index.html                 ← replace your current one
├── netlify.toml               ← new (merge if you already have one)
└── netlify/
    └── functions/
        ├── get-data.mjs
        ├── save-data.mjs
        ├── sync.mjs
        └── lib/
            ├── jsonbin.mjs
            ├── football.mjs
            └── auth.mjs
```

## 2. Set environment variables (Netlify → Site settings → Environment variables)

| Variable | Value |
|---|---|
| `JSONBIN_BIN_ID` | your bin id |
| `JSONBIN_KEY` | a jsonbin key with **Read + Update** permission (your Master Key works) |
| `FOOTBALL_DATA_TOKEN` | your football-data.org token |
| `ADMIN_PASSWORD` | a **new** strong password (don't reuse `admin2026`) |

You can now delete the old injected variables and any `###INJECTED_*###` build
step — the page doesn't read them anymore.

## 3. Rotate the old keys (important)

Your jsonbin key, football-data token, and the password `admin2026` were visible
in the deployed page for a while, so treat them as compromised:

- **jsonbin:** create a new Access Key (Read + Update), put it in `JSONBIN_KEY`, delete the old one.
- **football-data:** regenerate your token if your account allows it, then update `FOOTBALL_DATA_TOKEN`.
- **admin password:** just set a new `ADMIN_PASSWORD`.

## 4. The `_redirects` proxy is now optional

`/api/* → football-data.org` was only needed because the browser called the API.
The `sync` function calls football-data directly (server-side, no CORS), so you can
leave the line in or remove it — it no longer affects the app.

## 5. Deploy & verify

1. Commit the files, set the env vars, deploy.
2. Open the site → it loads fixtures through `get-data` (no keys in "View Source" — check!).
3. Log in with your new password → tap **Fetch API Matches** → it calls `sync`, which
   imports fixtures + scores + Golden Boot + standings and **keeps every existing bet**.
4. Add/edit a bet → it saves through `save-data` (rejected without the password).

## How it stays cheap

- **No scheduled function** — nothing runs on a timer, so no background credit burn.
- `get-data` is cached at Netlify's edge for ~30s, so 50 people refreshing during a
  match collapse into roughly one jsonbin read, protecting your jsonbin request credits.
- `sync` and `save-data` only run when an admin actually clicks/saves.

## Notes

- The admin password is held in `sessionStorage` after login (cleared when the tab
  closes) and sent over HTTPS on each write. It's never written into the page source.
- If a write ever returns 401 (e.g. you changed the password), the app logs you out
  and asks you to log in again.
- When you later want fully-automatic score updates, the same `sync` function can be
  wired to a Netlify Scheduled Function — but that's optional and off for now.
