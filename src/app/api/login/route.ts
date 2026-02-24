import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";

const COOKIE_NAME = "__Secure-authjs.session-token";
const MAX_AGE = 30 * 24 * 60 * 60; // 30 days

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();

    const expected = process.env.ADMIN_PASSWORD?.trim().replace(/\\\\/g, "").replace(/\\!/g, "!") ?? "";
    if (!expected || password !== expected) {
      return NextResponse.json({ error: "wrong_password" }, { status: 401 });
    }

    const secret = process.env.NEXTAUTH_SECRET!;
    const token = await encode({
      token: { id: "admin", name: "관리자", email: "admin@local", role: "ADMIN", actorId: null },
      secret,
      salt: COOKIE_NAME,
      maxAge: MAX_AGE,
    });

    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      path: "/",
      sameSite: "lax",
      maxAge: MAX_AGE,
    });
    return res;
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
