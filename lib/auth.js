const COOKIE_NAME = "sentinel_auth";

async function sha256Hex(input) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function expectedToken() {
  const password = process.env.DASHBOARD_PASSWORD || "";
  return sha256Hex(`sentinel::${password}`);
}

export function isAuthConfigured() {
  return Boolean(process.env.DASHBOARD_PASSWORD);
}

export function checkPassword(password) {
  const secret = process.env.DASHBOARD_PASSWORD || "";
  if (!secret) return false;
  return password === secret;
}

export async function tokenForCookie() {
  return expectedToken();
}

export async function isAuthedRequest(request) {
  if (!isAuthConfigured()) return false;
  const cookie = request.cookies?.get?.(COOKIE_NAME)?.value;
  if (!cookie) return false;
  const expected = await expectedToken();
  return cookie === expected;
}

export const AUTH_COOKIE_NAME = COOKIE_NAME;
