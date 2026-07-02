# World Cup 2026 Bet Tracker — Convex backend

This document describes the Convex backend that replaced the original jsonbin + Netlify
Functions architecture. It covers the current file layout, one-time setup, and day-to-day
usage for whoever maintains the deployment.

---

## What's in this repo

```
wc2026-bet-tracker/
├── index.html                 # SPA — calls Convex HTTP Actions at CONVEX_HTTP
├── convex/
│   ├── schema.js              # tables: players, sessions, matches, bets,
│   │                          #         signatures, accounts, ledger, meta
│   ├── lib.js                 # shared helpers (bet-outcome calc incl. voor rule, CORS)
│   ├── auth.js                # claim / login / change-password / sessions
│   ├── core.js                # players, matches, bets, signatures, ledger, settlement
│   ├── football.js            # football-data.org sync (rate-limit aware) + auto-settle
│   ├── crons.js               # scheduled job: expire unsigned bets 30 min before kickoff
│   └── http.js                # the public HTTP API (CORS + bearer-token auth)
├── netlify.toml               # static hosting config (no build step)
└── package.json               # one dependency: convex
```

Production deployment:
- Cloud URL  → `https://reliable-stork-400.convex.cloud`
- HTTP API   → `https://reliable-stork-400.convex.site`  ← the frontend calls this

`index.html` already points at the HTTP API:
```js
const CONVEX_HTTP = "https://reliable-stork-400.convex.site";
```

---

## One-time setup (for a new clone)

### 1. Install and link

```bash
npm install
npx convex dev
```

`npx convex dev` logs you in, links the folder to the Convex project, generates
`convex/_generated/`, and pushes functions to the **dev** deployment. Press Ctrl-C
once connected; use it again when doing local development.

### 2. Set production environment variables

```bash
npx convex env set --prod FOOTBALL_DATA_TOKEN  <your-football-data-token>
npx convex env set --prod SETUP_SECRET         <long-random-string>
```

`FOOTBALL_DATA_API_KEY` is also accepted as an alias for the token name.

### 3. Deploy to production

```bash
CONVEX_DEPLOYMENT=prod:reliable-stork-400 npx convex deploy
```

The `CONVEX_DEPLOYMENT` override is required when running non-interactively (e.g. from
Claude Code or CI) because `.env.local` points to the dev deployment.

### 4. Seed the admin and players (once)

```bash
curl -X POST https://reliable-stork-400.convex.site/admin/seed \
  -H "Content-Type: application/json" \
  -d '{"secret":"<SETUP_SECRET>","adminName":"Suta","names":[]}'
```

Players are created **unclaimed** (no password). Each player then opens the site → Log in →
Claim account → sets their own password. You can delete `SETUP_SECRET` after seeding.

---

## Day-to-day (treasurer)

| Action | How |
|---|---|
| Update scores / standings | Log in → **Sync** button. Settled bets are handled automatically. |
| Fix a knockout result | **Set result** on the match card → enter scores → pick who advanced |
| Add a player | **＋ Player** button in the header |
| Remove a player | × button next to their name in the treasury table (blocked if they have open/agreed bets) |
| Record a deposit | **Deposit** button in the header |

**Bet lockout:** unsigned bets are automatically cancelled 30 minutes before kickoff by a
background job (`crons.js`) that runs every minute. Players also can't propose or sign within
this window — the server rejects the action.

---

## HTTP API reference

Base: `https://reliable-stork-400.convex.site` · auth via `Authorization: Bearer <token>`

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /claim` | none | first-time: set your password |
| `POST /login` | none | log in |
| `POST /logout` | player | end session |
| `POST /change-password` | player | set a new password |
| `GET  /state` | optional | everything the UI renders (balances only when authed) |
| `POST /ledger` | player | your transaction history |
| `POST /bet/propose` | player | propose + sign a bet |
| `POST /bet/sign` | player | opponent agrees → binding |
| `POST /bet/reject` | player | opponent rejects |
| `POST /bet/cancel` | proposer | cancel before opponent signs |
| `POST /admin/sync` | treasurer | pull fixtures/scores/stats + settle |
| `POST /admin/result` | treasurer | set a final score (+ optional advancer) and settle |
| `POST /admin/deposit` | treasurer | record a deposit / correction |
| `POST /admin/create-player` | treasurer | add a player |
| `POST /admin/delete-player` | treasurer | deactivate a player (blocked if they have open/agreed bets) |
| `POST /admin/seed` | setup secret | one-time bootstrap |

---

## Key design decisions

**Why Convex replaced jsonbin + Netlify Functions**

The old architecture stored all data as a single JSON blob in jsonbin. Adding signed bets
(two-party agreement, immutable records) and a ledger with transactional settlement requires
a real database with atomic writes — Convex provides this as a managed service with no
infrastructure to maintain.

**Voor (handicap) settlement rule**

- With a handicap → settled on the **90-minute regulation score** (`regHome`/`regAway`)
- No handicap → settled on the **overall winner** including extra time and penalties

`regHome`/`regAway` are populated by Sync when the API provides `score.regularTime`. If
the API omits it for an ET/pen match, those fields stay `null` and settlement defers until
the next Sync. The treasurer can also Sync after ET to capture the regulation score.

**Player deactivation (soft delete)**

`deletePlayer` sets `active: false`. Historical bets, signatures, and ledger entries
referencing the player are preserved. The player is excluded from the treasury display and
can no longer log in.
