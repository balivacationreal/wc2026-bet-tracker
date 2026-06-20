# World Cup 2026 Bet Tracker

A lightweight, single-page web app for tracking 1-on-1 football bets in IDR (Indonesian Rupiah) among a group of friends during FIFA World Cup 2026.

Deployed on Netlify with serverless functions as the backend. All secrets stay server-side — nothing sensitive appears in the page source.

## Features

**For all visitors (guest mode)**
- Browse all WC 2026 fixtures with live scores, half-time scores, and match status
- Filter matches by: All · Live · Upcoming · Finished · With Bets
- Search by team name
- View bets per match including handicap (Voor) details and settled outcomes
- Leaderboard showing each player's net balance in IDR
- Debt settlement summary (who owes whom)
- Golden Boot tracker (top scorers)
- Group standings table
- Auto-refresh: every 60 s during live matches, every 5 min otherwise

**Admin mode** (password-protected)
- Log in via the "Admin Login" button; password is verified server-side
- Add, edit, or delete bets on any fixture
- Set or edit match results manually
- Fetch the latest fixtures, scores, scorers, and standings from football-data.org

## Betting rules

- Each bet is 1-on-1: Player A picks one team, Player B picks the other
- Optional **handicap (Voor)**: a goal advantage is added to one team before determining the winner
  - Example: Brazil +1 means Brazil's score gets +1 goal before comparison
  - A half-goal handicap (0.5, 1.5, …) eliminates draws; whole-goal handicaps can result in a push (no payout)
- Amounts are in IDR (Indonesian Rupiah), minimum Rp 1,000

## Architecture

```
wc2026-bet-tracker/
├── index.html                      # Single-page app (Tailwind CSS + vanilla JS)
├── netlify.toml                    # Build + function settings
├── _redirects                      # Netlify redirect rules
└── netlify/functions/
    ├── get-data.mjs                # Public read (CDN-cached, no auth required)
    ├── save-data.mjs               # Admin-only: save bets and match results
    ├── sync.mjs                    # Admin-only: pull from football-data.org
    └── lib/
        ├── auth.mjs                # Timing-safe password verification
        ├── football.mjs            # football-data.org API client + merge logic
        └── jsonbin.mjs             # JSONBin.io read/write helpers
```

**Data flow**

- All match data, bets, scorers, and standings are stored as a single JSON record on [JSONBin.io](https://jsonbin.io).
- `get-data` is a public read with a 30 s Netlify CDN cache — many concurrent viewers share one JSONBin read, protecting the free-tier request quota.
- `save-data` and `sync` are write operations that require the admin password on every call.
- Match data comes from [football-data.org](https://www.football-data.org/) (free tier: 10 calls/min). The `sync` function merges new fixtures and scores while preserving all existing bets.

## Setup & deployment

### 1. Fork / clone this repo

```bash
git clone <your-repo-url>
cd wc2026-bet-tracker
```

### 2. Create a JSONBin bin

Sign up at [jsonbin.io](https://jsonbin.io), create a new bin (any initial content), and note the **Bin ID** and an **Access Key** with Read + Update permission.

### 3. Get a football-data.org token

Register at [football-data.org](https://www.football-data.org/) (free tier is sufficient) and copy your API token.

### 4. Deploy to Netlify

Push to GitHub/GitLab and connect the repo in [Netlify](https://netlify.com). Set the following environment variables under **Site settings → Environment variables**:

| Variable | Description |
|---|---|
| `JSONBIN_BIN_ID` | Your JSONBin bin ID |
| `JSONBIN_KEY` | JSONBin access key (Read + Update) |
| `FOOTBALL_DATA_TOKEN` | football-data.org API token |
| `ADMIN_PASSWORD` | A strong password for admin access |

The build settings from `netlify.toml` are picked up automatically:
- **Publish directory:** `.` (repo root)
- **Functions directory:** `netlify/functions`
- **Node version:** 20

### 5. Load fixtures

After deploying, open the site, log in as admin, and click **Fetch API Matches**. This pulls the full WC 2026 schedule, scorers, and group standings from football-data.org into JSONBin. All subsequent visitors read from the cached function — not directly from football-data.

## Security notes

- No secrets appear in the browser or page source.
- The admin password is entered at login, kept only in `sessionStorage` for the current tab, and sent over HTTPS on every write. It is verified server-side using a constant-time comparison (timing-safe equal) to prevent timing attacks.
- If you ever change `ADMIN_PASSWORD`, active sessions are automatically invalidated on the next write attempt and the user is prompted to log in again.
- See [SECURITY-SETUP.md](SECURITY-SETUP.md) for a full before/after comparison and key-rotation instructions.

## Participants

Ngurah · Wipradnyana · Wage · Suta · Ali Topan · Midun · Darsika · Sony

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | HTML · [Tailwind CSS](https://tailwindcss.com) (CDN) · Vanilla JS |
| Backend | [Netlify Functions](https://docs.netlify.com/functions/overview/) (ESM, Node 20) |
| Storage | [JSONBin.io](https://jsonbin.io) |
| Match data | [football-data.org](https://www.football-data.org/) v4 API |
| Flags | [flagcdn.com](https://flagcdn.com) |
| Hosting | [Netlify](https://netlify.com) |
