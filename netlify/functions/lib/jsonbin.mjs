// jsonbin.io v3 helper. Credentials live in Netlify env vars, never the browser.

const BASE = "https://api.jsonbin.io/v3/b";

function cfg() {
  const binId = process.env.JSONBIN_BIN_ID;
  const key = process.env.JSONBIN_KEY || process.env.JSONBIN_API_KEY; // must allow Read + Update
  if (!binId || !key) {
    throw new Error("Missing JSONBIN_BIN_ID or JSONBIN_KEY/JSONBIN_API_KEY environment variable");
  }
  return { binId, key };
}

// Returns the stored record object, e.g. { matches, scorers, standings, lastSync }.
export async function readBin() {
  const { binId, key } = cfg();
  const res = await fetch(`${BASE}/${binId}/latest`, {
    headers: { "X-Access-Key": key }
  });
  if (!res.ok) {
    throw new Error(`jsonbin read failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  // v3 wraps as { record, metadata }; unwrap defensively.
  return data && typeof data === "object" && "record" in data ? data.record : data;
}

// Overwrites the bin with `record`. Versioning off keeps the bin lean.
export async function writeBin(record) {
  const { binId, key } = cfg();
  const res = await fetch(`${BASE}/${binId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Access-Key": key,
      "X-Bin-Versioning": "false"
    },
    body: JSON.stringify(record)
  });
  if (!res.ok) {
    throw new Error(`jsonbin write failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}
