import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";

const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;

      // 기존 사용자 확인
      const existingUser = await prisma.user.findUnique({
        where: { email: user.email },
      });

      // 새 사용자: admin 이메일이면 ADMIN, 아니면 ACTOR
      if (!existingUser) {
        const role = adminEmails.includes(user.email) ? "ADMIN" : "ACTOR";
        // PrismaAdapter가 유저 생성 후 이 콜백이 호출되므로,
        // 생성 직후 role을 업데이트
        setTimeout(async () => {
          try {
            await prisma.user.update({
              where: { email: user.email! },
              data: { role },
            });
          } catch {
            // 첫 로그인 시 타이밍 이슈 무시
          }
        }, 100);
      }

      return true;
    },
    async session({ session, user }) {
      if (session.user) {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          include: { actor: true },
        });
        session.user.id = user.id;
        session.user.role = (dbUser?.role as "ADMIN" | "ACTOR") ?? "ACTOR";
        session.user.actorId = dbUser?.actorId ?? null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
