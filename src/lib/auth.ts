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
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;

      const existingUser = await prisma.user.findUnique({
        where: { email: user.email },
      });

      if (!existingUser) {
        const role = adminEmails.includes(user.email) ? "ADMIN" : "ACTOR";
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
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
      }
      // 로그인 시 또는 세션 업데이트 시 DB에서 최신 정보 가져오기
      if (trigger === "signIn" || trigger === "update" || !token.role) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { role: true, actorId: true },
        });
        if (dbUser) {
          token.role = dbUser.role;
          token.actorId = dbUser.actorId;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as "ADMIN" | "ACTOR") ?? "ACTOR";
        session.user.actorId = (token.actorId as string) ?? null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
