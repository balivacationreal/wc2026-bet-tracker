// Server-side football-data.org access. The token stays here, never in the client.
// Fetches fixtures + scorers + standings, then merges fixtures into the existing
// record WITHOUT touching any bets.

const FD_BASE = "https://api.football-data.org/v4";
const WC = "2000"; // FIFA World Cup competition id
const WITA = "Asia/Makassar"; // Bali, UTC+8

function token() {
  const t = process.env.FOOTBALL_DATA_TOKEN || process.env.FOOTBALL_DATA_API_KEY;
  if (!t) throw new Error("Missing FOOTBALL_DATA_TOKEN/FOOTBALL_DATA_API_KEY environment variable");
  return t;
}

function mapStatus(s) {
  if (s === "FINISHED" || s === "AWARDED") return "Finished";
  if (s === "IN_PLAY" || s === "PAUSED" || s === "SUSPENDED") return "Live";
  return "Upcoming";
}

function formatDate(iso) {
  if (!iso) return "TBD";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: WITA, day: "numeric", month: "short",
      hour: "2-digit", minute: "2-digit", hour12: false
    }).format(new Date(iso));
  } catch { return iso; }
}

export class RateLimitError extends Error {
  constructor(resetSeconds) {
    super("football-data rate limit reached");
    this.name = "RateLimitError";
    this.resetSeconds = resetSeconds;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fdGet(path) {
  const res = await fetch(`${FD_BASE}${path}`, { headers: { "X-Auth-Token": token() } });
  if (res.status === 429) {
    const raw = res.headers.get("X-RequestCounter-Reset") || res.headers.get("x-requestcounter-reset");
    const reset = parseInt(raw || "60", 10);
    throw new RateLimitError(Number.isNaN(reset) ? 60 : reset);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`football-data ${path} -> ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

function transformScorers(data) {
  if (!data || !Array.isArray(data.scorers)) return null;
  return data.scorers.map((s) => ({
    name: s.player?.name || "—",
    team: s.team?.name || "",
    crest: s.team?.crest || "",
    goals: s.goals ?? 0,
    assists: s.assists ?? null,
    penalties: s.penalties ?? null
  }));
}

function transformStandings(data) {
  if (!data || !Array.isArray(data.standings)) return null;
  return data.standings
    .filter((g) => g.type === "TOTAL")
    .map((g) => ({
      group: g.group || g.stage || "",
      table: (g.table || []).map((r) => ({
        pos: r.position,
        team: r.team?.name || "",
        crest: r.team?.crest || "",
        played: r.playedGames,
        won: r.won, draw: r.draw, lost: r.lost,
        gd: r.goalDifference, pts: r.points
      }))
    }));
}

function buildMeta(api) {
  return {
    home: api.homeTeam?.name,
    away: api.awayTeam?.name,
    crestHome: api.homeTeam?.crest || "",
    crestAway: api.awayTeam?.crest || "",
    utcDate: api.utcDate || null,
    date: formatDate(api.utcDate),
    stage: api.stage || null,
    group: api.group || null,
    matchday: api.matchday || null,
    minute: api.minute ?? null,
    htHome: api.score?.halfTime?.home ?? null,
    htAway: api.score?.halfTime?.away ?? null
  };
}

// Merge fixtures into `matches`, preserving bets. Returns { matches, added, updated }.
function mergeMatches(existing, apiMatches) {
  const matches = Array.isArray(existing) ? existing.map((m) => ({ ...m })) : [];
  let added = 0, updated = 0;

  for (const api of apiMatches) {
    const home = api.homeTeam?.name;
    const away = api.awayTeam?.name;
    if (!home || !away) continue; // skip unresolved knockout slots (TBD)

    const status = mapStatus(api.status);
    const hasScore = status === "Finished" || status === "Live";
    const homeScore = hasScore ? (api.score?.fullTime?.home ?? 0) : null;
    const awayScore = hasScore ? (api.score?.fullTime?.away ?? 0) : null;
    const meta = buildMeta(api);

    let m = matches.find((x) => x.apiId === api.id)
         || matches.find((x) => x.home === home && x.away === away);

    if (!m) {
      matches.push({ id: api.id, apiId: api.id, ...meta, homeScore, awayScore, status, bets: [] });
      added++;
    } else {
      m.apiId = api.id;
      Object.assign(m, meta);
      if (hasScore || status !== m.status) {
        m.homeScore = homeScore;
        m.awayScore = awayScore;
        m.status = status;
        updated++;
      }
    }
  }

  matches.sort((a, b) => {
    const ta = a.utcDate ? Date.parse(a.utcDate) : Infinity;
    const tb = b.utcDate ? Date.parse(b.utcDate) : Infinity;
    return ta - tb;
  });

  return { matches, added, updated };
}

// Pulls from football-data with the 10-calls/min free tier in mind:
//  - matches first (the only required call)
//  - scorers + standings are optional, spaced out, and best-effort
export async function fetchTournament({ includeStats = true } = {}) {
  const matchData = await fdGet(`/competitions/${WC}/matches`); // 1 call (required)
  if (!matchData || !Array.isArray(matchData.matches)) {
    throw new Error("football-data returned no matches");
  }

  let scorers = null;
  let standings = null;

  if (includeStats) {
    // Best-effort: if these hit the limit, we still keep the matches we already got.
    try { await sleep(1200); scorers = transformScorers(await fdGet(`/competitions/${WC}/scorers?limit=20`)); }
    catch (e) { /* keep previous scorers */ }
    try { await sleep(1200); standings = transformStandings(await fdGet(`/competitions/${WC}/standings`)); }
    catch (e) { /* keep previous standings */ }
  }

  return { apiMatches: matchData.matches, scorers, standings };
}

export { mergeMatches };
