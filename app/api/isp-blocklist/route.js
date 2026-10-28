import { NextResponse } from "next/server";
import { getIspBlocklist } from "@/lib/store";

export async function GET() {
  const ispBlocklist = await getIspBlocklist();
  return NextResponse.json({ ispBlocklist });
}
