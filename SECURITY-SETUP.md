# World Cup 2026 Bet Tracker — Security Model

This document describes the security architecture of the current Convex-based backend.

> **Historical note:** an earlier version of this app stored data in jsonbin and used Netlify
> Functions with an `ADMIN_PASSWORD` env var. That architecture no longer exists. If you
> migrated from that version, make sure you have rotated any previously-exposed tokens (see
> [Key rotation](#key-rotation) below).

---

## Secrets

No secrets are ever sent to the browser or stored in `index.html`. The page source contains
only the public `.convex.site` URL.

| Secret | Where it lives | Purpose |
|---|---|---|
| `FOOTBALL_DATA_TOKEN` | Convex env var (production) | football-data.org API calls — server-side only |
| `SETUP_SECRET` | Convex env var (production) | one-time guard on the `/admin/seed` endpoint |

Both are set with:
```bash
npx convex env set --prod FOOTBALL_DATA_TOKEN  <value>
npx convex env set --prod SETUP_SECRET         <value>
```

You can delete `SETUP_SECRET` after seeding is complete if you want to disable the endpoint
permanently.

---

## Authentication

- Passwords are hashed with **SHA-256 + a random per-user salt** before storage. Plain-text
  passwords are never stored or logged.
- Sessions are **random 48-char hex bearer tokens** with a 30-day expiry, stored in the
  `sessions` Convex table.
- `authPlayer()` in `http.js` validates every inbound token and checks `player.active` before
  proceeding — deactivated players are rejected even if their token hasn't expired yet.
- Session tokens are stored in `localStorage` on the client. On logout the token is deleted
  from the database; on next load the client re-validates before granting access.

This is lightweight auth suited to a trusted friends' group — sufficient to make each
signature mean "this authenticated person agreed at this time," not bank-grade identity.

---

## Data-layer lockdown

All Convex query and mutation functions are declared `internal`. They are not reachable from
the internet. The only public surface is the HTTP router in `http.js`, which:

1. Validates the bearer token and resolves it to a player identity.
2. Checks role (`admin` / `member`) before calling admin-only mutations.
3. Passes a trusted `playerId` (not a client-supplied value) into every internal function.

Clients cannot call mutations directly, forge identities, or skip authorization checks.

---

## Tamper-evident records

- **Signatures** are written once and never mutated. Each stores the signer's player id,
  their role (A/B), and a timestamp. Bet terms are frozen at proposal time — there is no
  edit path.
- **Ledger** entries are append-only (`deposit`, `bet_win`, `bet_loss`, `adjustment`). Money
  never disappears; every balance change has a corresponding ledger row.
- **Settlement** runs inside a single Convex mutation (transactional), so winner credit and
  loser debit always happen together or not at all.

---

## Key rotation

If you previously ran the jsonbin/Netlify-Functions version of this app, your
`football-data.org` token was visible in the page source. Rotate it:

1. Generate a new token on [football-data.org](https://www.football-data.org/) (your account page).
2. Update the Convex env var: `npx convex env set --prod FOOTBALL_DATA_TOKEN <new-token>`
3. Deploy: `CONVEX_DEPLOYMENT=prod:reliable-stork-400 npx convex deploy`

The old `JSONBIN_BIN_ID`, `JSONBIN_KEY`, and `ADMIN_PASSWORD` Netlify environment variables
are no longer used and can be deleted from your Netlify site settings.
