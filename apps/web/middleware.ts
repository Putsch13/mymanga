import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { authDisabledInProduction, isAuthDisabled } from "@/lib/auth/auth-mode";

const PUBLIC_PREFIXES = [
  "/auth/callback",
  "/auth/signout",
  "/api/billing/webhooks",
  "/api/inngest",
  "/api/", // Toutes les API routes gèrent leur propre auth
];
const PUBLIC_EXACT = ["/", "/login"];

function isPublicRoute(pathname: string) {
  if (PUBLIC_EXACT.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  if (authDisabledInProduction()) {
    return NextResponse.json(
      { error: "invalid_auth_mode", message: "AUTH_DISABLED est interdit en production." },
      { status: 500 },
    );
  }

  if (isAuthDisabled()) {
    return NextResponse.next();
  }

  if (isPublicRoute(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
