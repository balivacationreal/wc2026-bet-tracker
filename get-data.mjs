import { readBin } from "./lib/jsonbin.mjs";

// Public read. Edge-cached so many viewers share a single jsonbin read,
// which protects your jsonbin request credits.
export default async () => {
  try {
    const record = await readBin();
    const body = JSON.stringify({
      matches: Array.isArray(record?.matches) ? record.matches : [],
      scorers: Array.isArray(record?.scorers) ? record.scorers : [],
      standings: Array.isArray(record?.standings) ? record.standings : [],
      lastSync: record?.lastSync || null
    });
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        // Netlify edge caches for 30s; serves stale up to 60s while revalidating.
        "Netlify-CDN-Cache-Control": "public, max-age=30, stale-while-revalidate=60",
        "Cache-Control": "public, max-age=10"
      }
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err), matches: [], scorers: [], standings: [] }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
