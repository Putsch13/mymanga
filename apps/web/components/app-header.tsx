"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Coins, LayoutDashboard, LogOut, Plus, Shield, Sparkles } from "lucide-react";
import { cn } from "@manga-ai-studio/ui";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects/new", label: "Nouveau projet", icon: Plus },
  { href: "/wallet", label: "Wallet", icon: Coins },
];

export function AppHeader({
  email,
  displayName,
  authDisabled,
  role,
}: {
  email: string;
  displayName: string | null;
  authDisabled: boolean;
  role: "user" | "admin";
}) {
  const pathname = usePathname();
  const allLinks = role === "admin" ? [...links, { href: "/admin", label: "Admin", icon: Shield }] : links;

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-[#0b0b10]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold tracking-tight text-foreground">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-rose-700 shadow-lg shadow-violet-900/40">
            <Sparkles className="h-4 w-4 text-white" />
          </span>
          <span className="hidden sm:inline">Manga AI Studio</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {allLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                pathname === href || (href !== "/dashboard" && pathname.startsWith(href))
                  ? "bg-card text-foreground"
                  : "text-muted-foreground hover:bg-card/50 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 opacity-70" />
              {label}
            </Link>
          ))}
        </nav>
        <nav className="flex items-center gap-1 md:hidden">
          {allLinks.slice(0, 3).map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "rounded-lg px-2 py-2 text-muted-foreground",
                pathname === href || (href !== "/dashboard" && pathname.startsWith(href)) ? "bg-card text-foreground" : "",
              )}
              aria-label={label}
            >
              <Icon className="h-4 w-4" />
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm" className="max-w-[200px] truncate border-border/60">
                {displayName || email}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 border-border bg-card">
              <div className="px-2 py-1.5 text-xs text-muted-foreground">{email}</div>
              <DropdownMenuSeparator className="bg-border" />
              {!authDisabled ? (
                <DropdownMenuItem asChild>
                  <a href="/auth/signout" className="flex cursor-pointer items-center gap-2">
                    <LogOut className="h-4 w-4" />
                    Déconnexion
                  </a>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled className="text-xs">
                  Mode dev (auth désactivée)
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
