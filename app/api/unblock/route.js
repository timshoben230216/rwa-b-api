import { NextResponse } from "next/server";
import { unblockIp } from "@/lib/store";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const ip = (body.ip || "").trim();
  if (!ip) {
    return NextResponse.json({ error: "ip is required" }, { status: 400 });
  }
  await unblockIp(ip);
  return NextResponse.json({ ok: true, ip });
}
