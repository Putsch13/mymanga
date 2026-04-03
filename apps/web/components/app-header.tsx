"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookMarked, Coins, LayoutDashboard, LogOut, Shield, Sparkles, UserRound, Wand2 } from "lucide-react";
import { cn } from "@manga-ai-studio/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const links = [
  { href: "/dashboard", label: "Accueil", icon: LayoutDashboard },
  { href: "/mangas", label: "Bibliothèque", icon: BookMarked },
  { href: "/lab", label: "Labo", icon: Wand2 },
  { href: "/account", label: "Mon compte", icon: UserRound },
  { href: "/wallet", label: "Crédits", icon: Coins },
];

export function AppHeader({
  email,
  displayName,
  authDisabled,
  role,
  unlimitedAdmin,
}: {
  email: string;
  displayName: string | null;
  authDisabled: boolean;
  role: "user" | "admin";
  unlimitedAdmin: boolean;
}) {
  const pathname = usePathname();
  const allLinks = role === "admin" ? [...links, { href: "/admin", label: "Admin", icon: Shield }] : links;

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-[#0b0b10]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
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
          {allLinks.slice(0, 4).map(({ href, label, icon: Icon }) => (
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
          {unlimitedAdmin ? (
            <Badge variant="outline" className="hidden border-emerald-500/40 text-emerald-300 lg:inline-flex">
              Admin illimité
            </Badge>
          ) : null}
          <Link
            href="/mangas"
            className="hidden items-center gap-2 rounded-lg border border-border/60 bg-card/50 px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground lg:flex"
          >
            <BookMarked className="h-4 w-4" />
            Reprendre
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm" className="max-w-[200px] truncate border-border/60">
                {displayName || email}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 border-border bg-card">
              <div className="px-2 py-1.5 text-xs text-muted-foreground">{email}</div>
              {unlimitedAdmin ? (
                <div className="px-2 pb-1.5 text-xs text-emerald-300">Accès admin illimité actif</div>
              ) : null}
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem asChild>
                <Link href="/wallet" className="flex items-center gap-2">
                  <Coins className="h-4 w-4" />
                  Crédits
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/account" className="flex items-center gap-2">
                  <UserRound className="h-4 w-4" />
                  Mon compte
                </Link>
              </DropdownMenuItem>
              {role === "admin" ? (
                <DropdownMenuItem asChild>
                  <Link href="/admin" className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Admin
                  </Link>
                </DropdownMenuItem>
              ) : null}
              {!authDisabled ? (
                <DropdownMenuItem asChild>
                  <form action="/auth/signout" method="post" className="w-full">
                    <button type="submit" className="flex w-full cursor-pointer items-center gap-2 text-left">
                    <LogOut className="h-4 w-4" />
                    Déconnexion
                    </button>
                  </form>
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
