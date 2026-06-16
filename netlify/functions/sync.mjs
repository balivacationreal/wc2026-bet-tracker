import { readBin, writeBin } from "./lib/jsonbin.mjs";
import { fetchTournament, mergeMatches, RateLimitError } from "./lib/football.mjs";
import { checkAdmin, json } from "./lib/auth.mjs";

// Quota guards for the football-data free tier (10 calls / minute):
const COOLDOWN_MS = 15000;          // min gap between real syncs (server-enforced)
const STATS_INTERVAL_MS = 5 * 60 * 1000; // refresh scorers/standings at most every 5 min

// Admin-only. Pulls fixtures (+ occasionally scorers/standings) from football-data,
// merges into the bin (bets preserved), and returns the fresh record.
export default async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let payload = {};
  try { payload = await req.json(); } catch { /* body optional */ }

  if (!checkAdmin(payload.password)) return json({ error: "unauthorized" }, 401);

  try {
    const current = (await readBin().catch(() => ({}))) || {};
    const now = Date.now();

    // Cooldown: rapid clicks just return the cached record, no API calls.
    const last = current.lastSync ? Date.parse(current.lastSync) : 0;
    const since = last ? now - last : Infinity;
    if (since < COOLDOWN_MS) {
      return json({
        ok: true,
        cached: true,
        wait: Math.ceil((COOLDOWN_MS - since) / 1000),
        added: 0,
        updated: 0,
        scorers: (current.scorers || []).length,
        standings: (current.standings || []).length,
        record: recordOut(current)
      });
    }

    // Only pull the slow-moving scorers/standings every few minutes.
    const lastStats = current.lastStatsSync ? Date.parse(current.lastStatsSync) : 0;
    const includeStats = !lastStats || now - lastStats > STATS_INTERVAL_MS;

    const { apiMatches, scorers, standings } = await fetchTournament({ includeStats });
    const { matches, added, updated } = mergeMatches(current.matches, apiMatches);

    const record = {
      ...current,
      matches,
      scorers: scorers ?? current.scorers ?? [],
      standings: standings ?? current.standings ?? [],
      lastSync: new Date(now).toISOString(),
      lastStatsSync: includeStats ? new Date(now).toISOString() : (current.lastStatsSync || null)
    };
    await writeBin(record);

    return json({
      ok: true,
      added,
      updated,
      statsRefreshed: includeStats,
      scorers: record.scorers.length,
      standings: record.standings.length,
      record: recordOut(record)
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return json({
        error: "rate_limited",
        wait: err.resetSeconds,
        message: `football-data limit reached. Wait ~${err.resetSeconds}s and try again.`
      }, 429);
    }
    return json({ error: String(err) }, 502);
  }
};

function recordOut(r) {
  return {
    matches: r.matches || [],
    scorers: r.scorers || [],
    standings: r.standings || [],
    lastSync: r.lastSync || null
  };
}
