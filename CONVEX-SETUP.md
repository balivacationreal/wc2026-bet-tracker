# World Cup 2026 Bet Tracker — Convex migration & setup

This replaces the old jsonbin + Netlify-Functions backend with a single **Convex**
backend that adds two features:

1. **Player accounts + two-party digital signatures.** Each player claims their own
   password. A bet is *proposed* by one player (auto-signed) and becomes **binding only
   when the named opponent signs**. Both signatures are stored as immutable, timestamped
   records, and a bet's terms can't be edited after it's proposed.
2. **Treasury / deposits.** The treasurer (Suta) records each player's deposit. When a
   match finishes, every agreed bet on it settles in one atomic transaction — winner's
   balance up, loser's down — and each move is written to an append-only ledger. Every
   player's *deposited* and *current balance* are always shown.

Netlify still hosts the static `index.html`. Everything else (data, auth, football-data
sync) now lives in Convex.

---

## What's in this repo now

```
wc2026-bet-tracker/
├── index.html                 # frontend — talks to Convex HTTP Actions
├── convex/
│   ├── schema.js              # tables: players, sessions, matches, bets,
│   │                          #         signatures, accounts, ledger, meta
│   ├── lib.js                 # shared helpers (outcome calc, CORS, public player)
│   ├── auth.js                # claim / login / change-password / sessions
│   ├── core.js                # players, matches, bets, signatures, ledger, settlement
│   ├── football.js            # football-data.org sync (rate-limit aware) + auto-settle
│   └── http.js                # the public API (CORS + bearer-token auth)
├── netlify.toml               # static hosting (functions no longer needed)
└── netlify/functions/         # OLD — can be deleted after you verify Convex works
```

Your Convex deployment (already provisioned):
- Cloud URL  → `https://reliable-stork-400.convex.cloud`
- HTTP API   → `https://reliable-stork-400.convex.site`  ← the frontend calls this

`index.html` already points at the HTTP API:
```js
const CONVEX_HTTP = "https://reliable-stork-400.convex.site";
```

---

## One-time setup

### 1. Install Convex and link the project
From the repo root (where `package.json` is — create one with `npm init -y` if you don't have it):

```bash
npm install convex
npx convex dev
```

The first `npx convex dev`:
- asks you to log in,
- prompts you to pick a project → choose the existing **reliable-stork-400**,
- generates `convex/_generated/` and pushes all the functions,
- then keeps watching for changes (leave it running while you work; Ctrl-C when done).

> The `convex/_generated/` folder is created by this command — don't write it yourself.
> The imports like `./_generated/server` and `./_generated/api` resolve once it runs.

### 2. Set the backend environment variables
These live in Convex now (not Netlify). Set them via the dashboard
(**Settings → Environment Variables**) or the CLI:

```bash
npx convex env set FOOTBALL_DATA_TOKEN  your-football-data-token
npx convex env set SETUP_SECRET         pick-a-long-random-string
```

`FOOTBALL_DATA_API_KEY` is also accepted if you prefer that name. `SETUP_SECRET`
protects the one-time seed endpoint below.

### 3. Seed the players (once)
This creates all participants and marks **Suta** as the treasurer (admin). Run it once:

```bash
curl -X POST https://reliable-stork-400.convex.site/admin/seed \
  -H "Content-Type: application/json" \
  -d '{
        "secret": "the-SETUP_SECRET-you-set",
        "adminName": "Suta",
        "names": ["Ngurah","Wipradnyana","Wage","Suta","Ali Topan","Midun","Darsika","Sony"]
      }'
```

Players start **unclaimed** (no password yet). After seeding you can delete `SETUP_SECRET`
if you like, or keep it for re-seeding.

### 4. Deploy the frontend
Push to GitHub as usual; Netlify serves `index.html`. (Remember to clear the old
`sed` build command — it's obsolete. You can keep Netlify hosting; the functions folder
is no longer used.)

### 5. Everyone claims their account
Each player opens the site → **Log in** → picks their name → since they're unclaimed,
the button says **Claim account** → they set their own password. Suta does this too
(Suta will then see the treasurer controls: Sync, Deposit, ＋ Player, Set Result).

---

## Day-to-day

**Treasurer (Suta)**
- **Sync** — pulls fixtures, scores, Golden Boot and standings from football-data.org.
  Finished matches auto-settle agreed bets. (15s cooldown; stats refresh every ~5 min;
  back-off on rate limits — same pacing as before.)
- **Deposit** — record a player's deposit (use a negative number to make a correction).
- **＋ Player** — add someone new (they then claim their own password).
- **Set Result** — manually enter/override a final score; settles that match's bets.

**Any logged-in player**
- **Propose Bet** on an upcoming match: pick your team, choose an opponent (they take the
  other team), set the stake and optional handicap. Proposing signs your side.
- **Agree & sign** / **Reject** bets waiting for you (they appear in the amber inbox at the
  top and on the match card). Once you sign, the bet is binding.
- **my history** — your full deposit/win/loss ledger.

A bet you propose can be **cancelled** until your opponent signs. The system blocks a
proposal or signature if it would exceed your available balance (current balance minus
the money already tied up in open + agreed bets), so the treasury can never go negative.

---

## Notes & cleanup

- **Old bets don't migrate.** The jsonbin data used a different (peer-to-peer, no-signature)
  model. Fixtures get re-pulled by Sync; bets are re-created in the new signed system.
- **Retire the old backend** once Convex is verified: delete `netlify/functions/` and the
  `JSONBIN_*` / `ADMIN_PASSWORD` Netlify environment variables. Keep Netlify for hosting.
- **Rotate keys.** Your old football-data token (and the jsonbin key) were exposed in the
  page source historically — generate fresh ones and put the new football-data token in
  Convex (`FOOTBALL_DATA_TOKEN`).
- **Auto-sync later (optional).** If you want hands-off updates during match days, Convex
  Cron can call the sync on a schedule (e.g. every 2 minutes while games are live) with no
  Netlify credits involved. Say the word and I'll add a `convex/crons.js`.
- **Security scope.** This is lightweight session auth (SHA-256 + salt, 30-day bearer
  tokens) suited to a friends' group — good enough to make a signature mean "this
  authenticated person agreed at this time," not bank-grade identity.

---

## Quick API reference (Convex HTTP Actions)

Base: `https://reliable-stork-400.convex.site` · auth via `Authorization: Bearer <token>`

| Method & path          | Auth        | Purpose                                  |
|------------------------|-------------|------------------------------------------|
| `POST /claim`          | none        | first-time: set your password            |
| `POST /login`          | none        | log in                                   |
| `POST /logout`         | player      | end session                              |
| `POST /change-password`| player      | set a new password                       |
| `GET  /state`          | optional    | everything the UI renders                |
| `POST /ledger`         | player      | your transaction history                 |
| `POST /bet/propose`    | player      | propose + sign a bet                     |
| `POST /bet/sign`       | player      | opponent agrees → binding                |
| `POST /bet/reject`     | player      | opponent rejects                         |
| `POST /bet/cancel`     | proposer    | cancel before opponent signs             |
| `POST /admin/sync`     | treasurer   | pull fixtures/scores/stats + settle      |
| `POST /admin/result`   | treasurer   | set a final score + settle               |
| `POST /admin/deposit`  | treasurer   | record a deposit / correction            |
| `POST /admin/create-player` | treasurer | add a player                          |
| `POST /admin/seed`     | setup secret| one-time bootstrap                       |
