import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma, type User } from "@manga-ai-studio/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAuthDisabled, requireSafeAuthMode } from "@/lib/auth/auth-mode";

const DEV_EMAIL = "dev@manga-ai.studio";

function emailInEnvList(email: string, raw: string): boolean {
  const list = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

function isAdminEmail(email: string): boolean {
  const configured = process.env.ADMIN_EMAILS ?? process.env.ADMIN_EMAIL ?? "";
  return email.toLowerCase() === "test@gmail.com" || (configured.trim() ? emailInEnvList(email, configured) : false);
}

export function isUnlimitedAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const configured = process.env.ADMIN_UNLIMITED_EMAILS ?? "test@gmail.com";
  return emailInEnvList(email, configured);
}

async function getOrCreateDevUser(): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { email: DEV_EMAIL } });
  if (existing) {
    const w = await prisma.wallet.findUnique({ where: { userId: existing.id } });
    if (!w) {
      await prisma.wallet.create({
        data: { userId: existing.id, balance: 2000, lifetimePurchased: 2000, lifetimeSpent: 0, lifetimeRefunded: 0 },
      });
    }
    return existing;
  }
  return prisma.user.create({
    data: {
      email: DEV_EMAIL,
      displayName: "Studio Dev",
      role: "admin",
      preferences: { create: {} },
      wallets: { create: { balance: 2000, lifetimePurchased: 2000, lifetimeSpent: 0, lifetimeRefunded: 0 } },
    },
  });
}

/**
 * Utilisateur applicatif Prisma : Supabase Auth ou mode dev.
 */
export async function getAppUser(): Promise<User | null> {
  requireSafeAuthMode();
  if (isAuthDisabled()) {
    return getOrCreateDevUser();
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { user: sb },
  } = await supabase.auth.getUser();
  if (!sb?.id) return null;

  const email = sb.email?.toLowerCase();
  if (!email) return null;
  const shouldBeAdmin = isAdminEmail(email);

  let user = await prisma.user.findUnique({ where: { supabaseAuthId: sb.id } });
  if (user) {
    if (user.email !== email) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          email,
          displayName: (sb.user_metadata?.full_name as string | undefined) ?? user.displayName,
          ...(shouldBeAdmin && user.role !== "admin" ? { role: "admin" } : {}),
        },
      });
    } else if (shouldBeAdmin && user.role !== "admin") {
      user = await prisma.user.update({ where: { id: user.id }, data: { role: "admin" } });
    }
    await ensureWallet(user.id);
    return user;
  }

  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail) {
    user = await prisma.user.update({
      where: { id: byEmail.id },
      data: {
        supabaseAuthId: sb.id,
        displayName: (sb.user_metadata?.full_name as string | undefined) ?? byEmail.displayName,
        ...(shouldBeAdmin && byEmail.role !== "admin" ? { role: "admin" } : {}),
      },
    });
    await ensureWallet(user.id);
    return user;
  }

  user = await prisma.user.create({
    data: {
      supabaseAuthId: sb.id,
      email,
      displayName: (sb.user_metadata?.full_name as string | undefined) ?? email.split("@")[0],
      role: shouldBeAdmin ? "admin" : "user",
      preferences: { create: {} },
      wallets: { create: { balance: 500, lifetimePurchased: 500, lifetimeSpent: 0, lifetimeRefunded: 0 } },
    },
  });
  return user;
}

async function ensureWallet(userId: string) {
  const w = await prisma.wallet.findUnique({ where: { userId } });
  if (!w) {
    await prisma.wallet.create({
      data: { userId, balance: 500, lifetimePurchased: 500, lifetimeSpent: 0, lifetimeRefunded: 0 },
    });
  }
}

export const getCurrentUser = cache(async (): Promise<User> => {
  const user = await getAppUser();
  if (!user) {
    redirect("/login");
  }
  return user;
});

export async function requireAppUser(): Promise<User> {
  return getCurrentUser();
}

export async function getCurrentUserWithPreferences(): Promise<{
  user: User;
  preferences: { matureContentEnabled: boolean; defaultLanguage: string } | null;
}> {
  const user = await getCurrentUser();
  const full = await prisma.user.findUnique({
    where: { id: user.id },
    include: { preferences: true },
  });

  return {
    user,
    preferences: full?.preferences
      ? {
          matureContentEnabled: full.preferences.matureContentEnabled,
          defaultLanguage: full.preferences.defaultLanguage,
        }
      : null,
  };
}
