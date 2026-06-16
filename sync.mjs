import { readBin, writeBin } from "./lib/jsonbin.mjs";
import { fetchTournament, mergeMatches } from "./lib/football.mjs";
import { checkAdmin, json } from "./lib/auth.mjs";

// Admin-only. Pulls fixtures + scorers + standings from football-data,
// merges fixtures into the bin (bets preserved), and returns the fresh record
// so the admin's screen updates instantly without waiting on the CDN cache.
export default async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let payload = {};
  try { payload = await req.json(); } catch { /* body optional */ }

  if (!checkAdmin(payload.password)) return json({ error: "unauthorized" }, 401);

  try {
    const { apiMatches, scorers, standings } = await fetchTournament();

    const current = (await readBin().catch(() => ({}))) || {};
    const { matches, added, updated } = mergeMatches(current.matches, apiMatches);

    const record = {
      ...current,
      matches,
      scorers: scorers ?? current.scorers ?? [],
      standings: standings ?? current.standings ?? [],
      lastSync: new Date().toISOString()
    };
    await writeBin(record);

    return json({
      ok: true,
      added,
      updated,
      scorers: record.scorers.length,
      standings: record.standings.length,
      record: {
        matches: record.matches,
        scorers: record.scorers,
        standings: record.standings,
        lastSync: record.lastSync
      }
    });
  } catch (err) {
    // Likely a rate limit (10/min free tier) or a bad token.
    return json({ error: String(err) }, 502);
  }
};
