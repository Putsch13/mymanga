import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { authDisabledInProduction, isAuthDisabled } from "@/lib/auth/auth-mode";

const API_PUBLIC_WHITELIST = [
  "/api/billing/webhooks/stripe",
  "/api/inngest",
  "/api/diagnostics/public",
  "/api/auth/callback",
];

const PUBLIC_UI_EXACT = ["/", "/login"];
const PUBLIC_UI_PREFIXES = ["/auth/callback", "/auth/signout"];

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_UI_EXACT.includes(pathname)) return true;
  if (PUBLIC_UI_PREFIXES.some(p => pathname.startsWith(p))) return true;

  if (pathname.startsWith("/api/")) {
    return API_PUBLIC_WHITELIST.some(w => pathname.startsWith(w));
  }

  return false;
}

export async function middleware(request: NextRequest) {
  if (authDisabledInProduction()) {
    return NextResponse.json(
      { error: "invalid_auth_mode", message: "AUTH_DISABLED est interdit en production." },
      { status: 500 },
    );
  }

  if (isPublicRoute(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (isAuthDisabled()) {
    return NextResponse.next();
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
