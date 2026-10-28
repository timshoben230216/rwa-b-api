import { NextResponse } from "next/server";
import { blockIsp } from "@/lib/store";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const isp = (body.isp || "").trim();
  if (!isp) {
    return NextResponse.json({ error: "isp is required" }, { status: 400 });
  }
  await blockIsp(isp);
  return NextResponse.json({ ok: true, isp });
}
