import { readBin, writeBin } from "./lib/jsonbin.mjs";
import { checkAdmin, json } from "./lib/auth.mjs";

// Admin-only write. Used for:
//  - { password, verifyOnly: true }  -> just validate the password (login check)
//  - { password, matches: [...] }    -> save bets/results (preserves scorers/standings)
export default async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let payload;
  try { payload = await req.json(); }
  catch { return json({ error: "invalid JSON body" }, 400); }

  if (!checkAdmin(payload.password)) return json({ error: "unauthorized" }, 401);

  // Login-time verification: password is valid, nothing to write.
  if (payload.verifyOnly) return json({ ok: true, verified: true });

  if (!Array.isArray(payload.matches)) {
    return json({ error: "matches array required" }, 400);
  }

  try {
    const current = (await readBin().catch(() => ({}))) || {};
    const record = {
      ...current,
      matches: payload.matches,          // bets/results live inside matches
      lastEdit: new Date().toISOString() // scorers/standings/lastSync preserved
    };
    await writeBin(record);
    return json({ ok: true, count: payload.matches.length });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
};
