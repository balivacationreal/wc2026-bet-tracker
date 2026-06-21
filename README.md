# World Cup 2026 Bet Tracker

A lightweight, single-page web app for tracking **signed 1-on-1 football bets** in IDR
(Indonesian Rupiah) among a group of friends during FIFA World Cup 2026.

Live: https://fifa-world-cup-2026-bet-track.netlify.app/

Each player has their own account, every bet is digitally signed by **both** parties before
it's binding, and a built-in treasury tracks each player's deposit and current balance —
settling automatically when matches finish. The frontend is a single static page on Netlify;
all data, auth, and match syncing run on [Convex](https://convex.dev).

---

## Features

**Guests (not logged in)**
- Browse all WC 2026 fixtures with live scores, half-time scores, and match status
- Filter by All · Live · Upcoming · Finished · With Bets, and search by team
- See every bet on each match, including handicap (Voor), signature status, and settled outcome
- Golden Boot (top scorers) and group standings
- Auto-refresh: every 60 s when a match is live, every 5 min otherwise

**Members (any logged-in player)**
- **Propose a bet** on an upcoming match: pick your team, choose an opponent (they take the
  other side), set the stake and an optional handicap
- **Agree & sign** or **reject** bets waiting for you — they appear in an inbox at the top
  and on the match card
- View the **treasury** (everyone's deposited total and current balance) and your own
  transaction **history**
- Change your password

**Treasurer (admin)**
- **Sync** fixtures, scores, scorers, and standings from football-data.org
- **Record deposits** (and corrections) per player
- **Add players**
- **Set / override** a match result manually, which settles its bets

---

## How a bet works (digital signatures)

1. A player **proposes** a bet naming the opponent, the stake, and an optional handicap.
   Proposing automatically signs the proposer's side.
2. The bet sits as **awaiting opponent** until the named opponent **signs**. Only then does it
   become **agreed** (binding). The opponent can **reject** instead, and the proposer can
   **cancel** until the opponent signs.
3. Each signature is stored as an **immutable, timestamped record**. A bet's terms can't be
   edited after it's proposed, so the two signatures always attest to fixed terms — this is the
   digital proof that replaces "we agreed on WhatsApp."

## How money works (treasury & settlement)

- The treasurer records each player's **deposit**; balances are derived from an append-only
  **ledger**.
- When a match finishes (via Sync or a manual result), every **agreed** bet on it settles in a
  single atomic transaction: winner's balance **+stake**, loser's **−stake**, each with its own
  ledger entry. A handicap that ends level is a **push** — no money moves.
- Proposing or signing is blocked if it would exceed a player's **available balance** (current
  balance minus the amount already tied up in open and agreed bets), so the treasury can't go
  negative.

## Betting rules

- Each bet is 1-on-1: one player picks a team, the opponent gets the other.
- Optional **handicap (Voor)**: goals added to one team before deciding the winner.
  - Example: `Brazil +1` adds one goal to Brazil before comparison.
  - A half-goal handicap (0.5, 1.5, …) removes draws; a whole-goal handicap can land on a **push**.
- Amounts are in IDR, minimum Rp 1,000.

---

## Architecture

```
wc2026-bet-tracker/
├── index.html              # SPA: Tailwind CSS (CDN) + vanilla JS; calls Convex HTTP Actions
├── convex/
│   ├── schema.js           # tables + indexes
│   ├── lib.js              # shared helpers (outcome calc, CORS, public-player shape)
│   ├── auth.js             # claim / login / change-password / sessions (hashing)
│   ├── core.js             # players, matches, bets, signatures, ledger, settlement, state
│   ├── football.js         # football-data.org sync (rate-limit aware) + auto-settle
│   └── http.js             # the public HTTP API (CORS + bearer-token auth)
├── netlify.toml            # static hosting config
├── CONVEX-SETUP.md         # full deploy / migration guide
└── SECURITY-SETUP.md       # security notes & key-rotation
```

**Data model (Convex tables)**

| Table | Purpose |
|---|---|
| `players` | name, role (admin/member), claimed flag, salted password hash |
| `sessions` | bearer token → player, with expiry |
| `matches` | fixtures synced from football-data.org |
| `bets` | terms, status, outcome, winner |
| `signatures` | immutable, timestamped agreement records |
| `accounts` | per-player `deposited` total and current `balance` |
| `ledger` | append-only money trail (deposit / bet_win / bet_loss / adjustment) |
| `meta` | singletons: scorers, standings, sync timestamps |

**Data flow**

- The frontend is a static page; it makes plain `fetch` calls to **Convex HTTP Actions** at
  `https://reliable-stork-400.convex.site`.
- Only the HTTP endpoints are public. They validate the caller's bearer token, then call
  **internal** Convex functions with a trusted player id — clients can't reach the data layer
  directly or spoof identity.
- Match data comes from [football-data.org](https://www.football-data.org/) (free tier:
  10 calls/min). The `sync` action paces itself (15 s cooldown, stats refreshed every ~5 min,
  back-off on rate limits) and writes fixtures, scorers, and standings into Convex.
- Reads, writes, and settlement are transactional Convex mutations, so the ledger stays
  consistent under concurrent use.

---

## Setup & deployment

Prerequisites: Node.js, a [Convex](https://convex.dev) account, and a
[football-data.org](https://www.football-data.org/) API token.

### 1. Install & link
```bash
npm install convex
npx convex dev      # log in, pick the project; generates convex/_generated and pushes to dev
```

### 2. Set backend environment variables
Per deployment (omit `--prod` for dev, include it for production):
```bash
npx convex env set --prod FOOTBALL_DATA_TOKEN  <your-football-data-token>
npx convex env set --prod SETUP_SECRET         <a-long-random-string>
```
Generate a secret with: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`

### 3. Deploy to production
```bash
npx convex deploy
```

### 4. Seed the players (once)
```bash
curl -X POST https://reliable-stork-400.convex.site/admin/seed \
  -H "Content-Type: application/json" \
  -d '{"secret":"<SETUP_SECRET>","adminName":"Suta",
       "names":["Ngurah","Wipradnyana","Wage","Suta","Ali Topan","Midun","Darsika","Sony"]}'
```
Players start **unclaimed**; each sets their own password on first login.

### 5. Deploy the frontend
Set `CONVEX_HTTP` in `index.html` to your deployment's `.convex.site` URL (production uses
`https://reliable-stork-400.convex.site`), then push to GitHub — Netlify serves the static page.

### 6. First run
Open the site → **Log in** → **Suta** → **Claim account** (set a password) → **Sync** to load
fixtures → **Deposit** for each player. Everyone else then claims their own account and starts
proposing and signing bets.

> Full step-by-step and dev-vs-prod details are in **[CONVEX-SETUP.md](CONVEX-SETUP.md)**.

---

## HTTP API

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
| `POST /admin/result` | treasurer | set a final score + settle |
| `POST /admin/deposit` | treasurer | record a deposit / correction |
| `POST /admin/create-player` | treasurer | add a player |
| `POST /admin/seed` | setup secret | one-time bootstrap |

---

## Security notes

- **No secrets in the browser.** The football-data token and setup secret live in Convex
  environment variables (server-side); the page source contains only the public deployment URL.
- **Per-player auth.** Passwords are hashed with SHA-256 + a per-user salt; sessions are
  random 30-day bearer tokens. This is lightweight auth suited to a friends' group — enough to
  make a signature mean "this authenticated person agreed at this time," not bank-grade identity.
- **Locked-down data layer.** All query/mutation functions are `internal`; only the HTTP
  endpoints are public, and they authorize the token before passing a trusted player id inward.
- **Tamper-evident records.** Signatures are immutable and timestamped, bet terms are frozen at
  proposal, and the money ledger is append-only with transactional settlement.
- **Rotate keys.** If your football-data token (or any old jsonbin key) was ever exposed in page
  source historically, generate fresh ones and store the new token in Convex.

See **[SECURITY-SETUP.md](SECURITY-SETUP.md)** for more.

---

## Participants

Ngurah · Wipradnyana · Wage · Suta · Ali Topan · Midun · Darsika · Sony

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | HTML · [Tailwind CSS](https://tailwindcss.com) (CDN) · Vanilla JS |
| Backend | [Convex](https://convex.dev) — reactive DB + serverless functions + HTTP Actions |
| Auth | Lightweight token sessions (SHA-256 + per-user salt) |
| Match data | [football-data.org](https://www.football-data.org/) v4 API |
| Flags | [flagcdn.com](https://flagcdn.com) |
| Hosting | [Netlify](https://netlify.com) (static) |
