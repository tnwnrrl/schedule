import { signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function LoginPage() {
  // auth check is handled by middleware (getToken)
  // to avoid auth()/getToken() inconsistency causing redirect loops

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">공연 스케줄 관리</CardTitle>
          <p className="text-muted-foreground text-sm">
            Google 계정으로 로그인하세요
          </p>
        </CardHeader>
        <CardContent>
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
          >
            <Button type="submit" className="w-full" size="lg">
              Google로 로그인
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
