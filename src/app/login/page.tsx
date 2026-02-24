"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { googleSignIn } from "./actions";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push("/admin");
    } else {
      setError("비밀번호가 틀렸습니다");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">공연 스케줄 관리</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 관리자 비밀번호 로그인 */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="password"
              placeholder="관리자 비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            {error && (
              <p className="text-sm text-red-500 text-center">{error}</p>
            )}
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? "로그인 중..." : "관리자 로그인"}
            </Button>
          </form>

          {/* 구분선 */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-muted-foreground">또는</span>
            </div>
          </div>

          {/* 배우 Google 로그인 */}
          <form action={googleSignIn}>
            <Button type="submit" variant="outline" className="w-full" size="lg">
              Google로 로그인 (배우)
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
