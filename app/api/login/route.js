import { NextResponse } from "next/server";
import { checkPassword, tokenForCookie, AUTH_COOKIE_NAME } from "@/lib/auth";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const password = body.password || "";

  if (!checkPassword(password)) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE_NAME, await tokenForCookie(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  return res;
}
