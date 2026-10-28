// Classifies a request as "browser" (real browser) or a specific automated
// client type, based on User-Agent plus the hosting/proxy signal from geo.js.
//
// Only "browser" gets the real API payload — everything else gets the
// configured default response (see lib/store.js).

export function classify(userAgent, geo) {
  const ua = (userAgent || "").toLowerCase().trim();

  if (!ua) return "no-user-agent";

  if (ua.includes("postmanruntime") || ua.includes("postman")) return "postman";
  if (ua.includes("insomnia")) return "insomnia";
  if (
    ua.includes("python-requests") ||
    ua.includes("python-urllib") ||
    ua.includes("aiohttp") ||
    ua.includes("scrapy") ||
    ua.startsWith("python/")
  ) {
    return "python";
  }
  if (ua.includes("curl/")) return "curl";
  if (ua.includes("wget")) return "wget";
  if (ua.includes("httpie")) return "httpie";
  if (
    ua.includes("axios") ||
    ua.includes("node-fetch") ||
    ua.includes("go-http-client")
  ) {
    return "normal";
  }

  const looksLikeBrowser =
    ua.includes("mozilla") &&
    (ua.includes("chrome") ||
      ua.includes("safari") ||
      ua.includes("firefox") ||
      ua.includes("edg/") ||
      ua.includes("opr/"));

  // Even a browser-like UA gets flagged if it's coming from a datacenter —
  // that's the VPS/VM case (headless browser on a cloud box, curl spoofing
  // a UA string, etc.)
  if (geo?.hosting) return "vps";
  if (geo?.proxy) return "proxy";

  if (looksLikeBrowser) return "browser";

  return "unknown-bot";
}

// Types that get auto-added to the block list the moment they're seen,
// in addition to receiving the default response.
export const AUTO_BLOCK_TYPES = ["curl", "vps", "postman"];

export const TYPE_LABELS = {
  browser: "Browser",
  vps: "VPS / VM",
  proxy: "Proxy",
  postman: "Postman",
  insomnia: "Insomnia",
  python: "Python",
  curl: "curl",
  wget: "wget",
  httpie: "HTTPie",
  normal: "Normal",
  "no-user-agent": "No UA",
  "unknown-bot": "Unknown",
};
