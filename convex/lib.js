// Plain helpers (not Convex functions) shared across modules.

// Never leak salt / passwordHash to clients.
export function publicPlayer(p) {
  if (!p) return null;
  return { _id: p._id, name: p.name, role: p.role, claimed: p.claimed, active: p.active };
}

// Handicap-adjusted outcome for a finished match. Returns:
//   { result: "A" | "B" | "push" } or null if the match isn't final.
export function betOutcome(match, bet) {
  if (!match || match.status !== "Finished" || match.homeScore == null || match.awayScore == null) {
    return null;
  }
  let home = match.homeScore;
  let away = match.awayScore;
  if (bet.handicapTeam === match.home) home += bet.handicapValue || 0;
  if (bet.handicapTeam === match.away) away += bet.handicapValue || 0;

  let winningTeam = null;
  if (home > away) winningTeam = match.home;
  else if (away > home) winningTeam = match.away;

  if (!winningTeam) return { result: "push" };
  if (bet.choiceA === winningTeam) return { result: "A" };
  if (bet.choiceB === winningTeam) return { result: "B" };
  return { result: "push" };
}

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
