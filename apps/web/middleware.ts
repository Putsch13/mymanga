import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { authDisabledInProduction, isAuthDisabled } from "@/lib/auth/auth-mode";

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
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
