import { NextResponse } from "next/server";
import { getBlocklist } from "@/lib/store";

export async function GET() {
  const blocklist = await getBlocklist();
  return NextResponse.json({ blocklist });
}
