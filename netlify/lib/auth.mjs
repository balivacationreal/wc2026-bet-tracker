import { timingSafeEqual } from "node:crypto";

// Constant-time comparison so the response time doesn't leak the password.
export function checkAdmin(password) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw new Error("Missing ADMIN_PASSWORD environment variable");
  if (typeof password !== "string") return false;

  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders }
  });
}
