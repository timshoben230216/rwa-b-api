import { NextResponse } from "next/server";
import { getForceDefaultMode, setForceDefaultMode } from "@/lib/store";

export async function GET() {
  const enabled = await getForceDefaultMode();
  return NextResponse.json({ enabled });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const enabled = await setForceDefaultMode(Boolean(body.enabled));
  return NextResponse.json({ ok: true, enabled });
}
