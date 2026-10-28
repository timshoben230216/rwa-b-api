import { Redis } from "@upstash/redis";

// fromEnv() reads UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN, and
// falls back to KV_REST_API_URL / KV_REST_API_TOKEN for older KV-integration
// projects — either works without code changes.
const kv = Redis.fromEnv();

const RECORDS_KEY = "sentinel:records";
const BLOCKLIST_KEY = "sentinel:blocklist";
const ISP_BLOCKLIST_KEY = "sentinel:ispBlocklist";
const PAYLOAD_KEY = "sentinel:payload";
const DEFAULT_PAYLOAD_KEY = "sentinel:defaultPayload";
const FORCE_DEFAULT_KEY = "sentinel:forceDefault";
const MAX_RECORDS = 500;

// ISPs blocked out of the box, before any manual admin action. Add more by
// blocking them from the ISP Block List tab — this is just the seed set.
const SEEDED_BLOCKED_ISPS = ["Amazon.com, Inc."];

function normalizeIsp(isp) {
  return (isp || "").trim().toLowerCase();
}

// Fallback for the "allowed" response, used until something is saved via
// /api/payload (dashboard's Response tab).
const ALLOWED_PAYLOAD_FALLBACK = {
  status: "ok",
  message: "Test from API v1",
  data: "module.exports = () => 1 + 1;",
};

// Fallback for the "default" response — served to blocked IPs, flagged
// (non-browser) request types, and to everyone when force-default mode is
// on. Empty by default, matching "just return {}" for anything suspicious.
const DEFAULT_PAYLOAD_FALLBACK = {};

// ---- Request log ----

export async function logRequest(record) {
  await kv.lpush(RECORDS_KEY, JSON.stringify(record));
  await kv.ltrim(RECORDS_KEY, 0, MAX_RECORDS - 1);
  return record;
}

export async function getRecords(limit = 200) {
  const raw = await kv.lrange(RECORDS_KEY, 0, limit - 1);
  return raw.map((r) => (typeof r === "string" ? JSON.parse(r) : r));
}

// ---- Block list ----
// Stored as a hash: ip -> JSON { blockedAt }

export async function blockIp(ip) {
  await kv.hset(BLOCKLIST_KEY, {
    [ip]: JSON.stringify({ ip, blockedAt: Date.now() }),
  });
}

export async function unblockIp(ip) {
  await kv.hdel(BLOCKLIST_KEY, ip);
}

export async function isBlocked(ip) {
  if (!ip) return false;
  const exists = await kv.hexists(BLOCKLIST_KEY, ip);
  return Boolean(exists);
}

export async function getBlocklist() {
  const all = await kv.hgetall(BLOCKLIST_KEY);
  if (!all) return [];
  return Object.values(all)
    .map((v) => (typeof v === "string" ? JSON.parse(v) : v))
    .sort((a, b) => b.blockedAt - a.blockedAt);
}

// ---- ISP block list ----
// Stored as a hash: normalized(isp) -> JSON { isp, blockedAt }
// Seeded once with SEEDED_BLOCKED_ISPS on first use; after that, seeding
// never runs again, so an admin unblocking a seeded ISP sticks.

const ISP_SEEDED_KEY = "sentinel:ispSeeded";

async function ensureIspSeed() {
  const seeded = await kv.get(ISP_SEEDED_KEY);
  if (seeded) return;
  for (const isp of SEEDED_BLOCKED_ISPS) {
    await kv.hset(ISP_BLOCKLIST_KEY, {
      [normalizeIsp(isp)]: JSON.stringify({ isp, blockedAt: Date.now() }),
    });
  }
  await kv.set(ISP_SEEDED_KEY, "1");
}

export async function blockIsp(isp) {
  const clean = (isp || "").trim();
  if (!clean) return;
  await kv.hset(ISP_BLOCKLIST_KEY, {
    [normalizeIsp(clean)]: JSON.stringify({ isp: clean, blockedAt: Date.now() }),
  });
}

export async function unblockIsp(isp) {
  await ensureIspSeed();
  await kv.hdel(ISP_BLOCKLIST_KEY, normalizeIsp(isp));
}

export async function isIspBlocked(isp) {
  if (!isp) return false;
  await ensureIspSeed();
  const exists = await kv.hexists(ISP_BLOCKLIST_KEY, normalizeIsp(isp));
  return Boolean(exists);
}

export async function getIspBlocklist() {
  await ensureIspSeed();
  const all = await kv.hgetall(ISP_BLOCKLIST_KEY);
  if (!all) return [];
  return Object.values(all)
    .map((v) => (typeof v === "string" ? JSON.parse(v) : v))
    .sort((a, b) => b.blockedAt - a.blockedAt);
}

// ---- Response payload ----
// The JSON body returned to allowed ("browser") callers of /api/v1.
// Editable at runtime via /api/payload — no redeploy needed.

export async function getPayload() {
  const raw = await kv.get(PAYLOAD_KEY);
  if (!raw) return ALLOWED_PAYLOAD_FALLBACK;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function setPayload(payload) {
  await kv.set(PAYLOAD_KEY, JSON.stringify(payload));
  return payload;
}

// ---- Default response payload ----
// The JSON body returned to blocked IPs, non-browser request types, and
// (when force-default mode is on) literally everyone. Editable at runtime
// via /api/default-payload.

export async function getDefaultPayload() {
  const raw = await kv.get(DEFAULT_PAYLOAD_KEY);
  if (raw === null || raw === undefined) return DEFAULT_PAYLOAD_FALLBACK;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function setDefaultPayload(payload) {
  await kv.set(DEFAULT_PAYLOAD_KEY, JSON.stringify(payload));
  return payload;
}

// ---- Force-default mode ----
// A manual kill switch: when on, every caller of /api/v1 gets the default
// response regardless of IP, block status, or detected type.

export async function getForceDefaultMode() {
  const raw = await kv.get(FORCE_DEFAULT_KEY);
  if (raw === null || raw === undefined) return false;
  return raw === true || raw === "true";
}

export async function setForceDefaultMode(enabled) {
  await kv.set(FORCE_DEFAULT_KEY, JSON.stringify(Boolean(enabled)));
  return Boolean(enabled);
}
