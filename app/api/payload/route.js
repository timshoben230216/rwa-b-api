import { NextResponse } from "next/server";
import { getPayload, setPayload } from "@/lib/store";

export async function GET() {
  const payload = await getPayload();
  return NextResponse.json({ payload });
}

export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
  }
  const saved = await setPayload(body);
  return NextResponse.json({ ok: true, payload: saved });
}
