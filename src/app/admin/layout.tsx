import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { NavBar } from "@/components/nav-bar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/actor");

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar
        userName={session.user.name}
        userRole="ADMIN"
        signOutAction={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      />
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
