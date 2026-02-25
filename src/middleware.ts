import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public API routes → pass through (자체 인증 사용)
  if (
    pathname.startsWith("/api/auth") ||
    pathname === "/api/login" ||
    pathname.startsWith("/api/casting/reservations") ||
    pathname.startsWith("/api/reservations/") ||
    pathname.startsWith("/api/cron/")
  ) {
    return NextResponse.next();
  }

  const isSecure = req.cookies.has("__Secure-authjs.session-token");
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: isSecure,
  });

  // Login page: authenticated users → redirect to appropriate page
  if (pathname === "/login") {
    if (token) {
      const dest = token.role === "ADMIN" ? "/admin" : "/actor";
      return NextResponse.redirect(new URL(dest, req.url));
    }
    return NextResponse.next();
  }

  // Protected routes: not authenticated → redirect to login
  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin routes guard
  if (pathname.startsWith("/admin") && token.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/actor", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/admin/:path*", "/actor/:path*", "/login", "/api/((?!auth).*)"],
};
