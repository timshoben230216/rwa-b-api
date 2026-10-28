// Looks up geo + hosting/proxy signal for an IP using ip-api.com (free tier).
// Swap this out for a paid provider (ipinfo.io, ipapi.co, MaxMind) if you need
// HTTPS-only egress or higher rate limits in production.

const FIELDS =
  "status,message,country,countryCode,regionName,city,isp,org,as,mobile,proxy,hosting,query";

export async function lookupGeo(ip) {
  if (!ip || ip === "127.0.0.1" || ip === "::1") {
    return {
      country: "Local",
      city: "Local",
      isp: "Local",
      org: "Local",
      as: "",
      mobile: false,
      proxy: false,
      hosting: false,
    };
  }

  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=${FIELDS}`, {
      // ip-api free tier is HTTP only; this is a server-to-server call, not
      // a browser request, so it's not subject to mixed-content blocking.
      cache: "no-store",
    });
    const data = await res.json();
    if (data.status !== "success") {
      return fallbackGeo();
    }
    return {
      country: data.country || "Unknown",
      countryCode: data.countryCode || "",
      city: data.city || "Unknown",
      isp: data.isp || "Unknown",
      org: data.org || "",
      as: data.as || "",
      mobile: Boolean(data.mobile),
      proxy: Boolean(data.proxy),
      hosting: Boolean(data.hosting),
    };
  } catch (err) {
    return fallbackGeo();
  }
}

function fallbackGeo() {
  return {
    country: "Unknown",
    city: "Unknown",
    isp: "Unknown",
    org: "",
    as: "",
    mobile: false,
    proxy: false,
    hosting: false,
  };
}
