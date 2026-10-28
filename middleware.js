import { NextResponse } from "next/server";
import { isAuthedRequest, isAuthConfigured } from "@/lib/auth";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/api/records",
    "/api/block",
    "/api/unblock",
    "/api/blocklist",
    "/api/isp-block",
    "/api/isp-unblock",
    "/api/isp-blocklist",
    "/api/payload",
    "/api/default-payload",
    "/api/force-default",
  ],
};

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  if (!isAuthConfigured()) {
    const message =
      "DASHBOARD_PASSWORD is not set. Add it to your environment variables " +
      "(.env.local for local dev, Vercel project settings for deployment) " +
      "and restart/redeploy before the dashboard will work.";
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: message }, { status: 500 });
    }
    return new NextResponse(message, {
      status: 500,
      headers: { "content-type": "text/plain" },
    });
  }

  if (pathname === "/dashboard/login") return NextResponse.next();
  if (await isAuthedRequest(request)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/dashboard/login", request.url);
  return NextResponse.redirect(loginUrl);
}
