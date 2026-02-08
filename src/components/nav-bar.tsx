"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

interface NavBarProps {
  userName?: string | null;
  userRole: "ADMIN" | "ACTOR";
}

export function NavBar({ userName, userRole }: NavBarProps) {
  const pathname = usePathname();

  const adminLinks = [
    { href: "/admin", label: "대시보드" },
    { href: "/admin/casting", label: "배역 배정" },
    { href: "/admin/actors", label: "배우 관리" },
  ];

  const actorLinks = [
    { href: "/actor", label: "내 일정" },
    { href: "/actor/unavailable", label: "불가일정 등록" },
  ];

  const links = userRole === "ADMIN" ? adminLinks : actorLinks;

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-bold">
            공연 스케줄
          </Link>
          <nav className="flex items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-gray-100",
                  pathname === link.href
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-600"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">{userName}</span>
          <form action="/api/auth/signout" method="POST">
            <Button variant="ghost" size="sm" type="submit">
              <LogOut className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
