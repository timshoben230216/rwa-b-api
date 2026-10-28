import { NextResponse } from "next/server";
import { getRecords } from "@/lib/store";

export async function GET() {
  const records = await getRecords(200);
  return NextResponse.json({ records });
}
