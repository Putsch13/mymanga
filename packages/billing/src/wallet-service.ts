import type { PrismaClient, WalletTransactionType, Prisma } from "@manga-ai-studio/db";

/**
 * P0.6 — Wallet transactionnel avec reserve/capture/release.
 *
 * Flow:
 * 1. reserveTokens() → crée une réservation (balance - amount, reservedBalance + amount)
 * 2. Au succès: captureReservation() → confirme la dépense (reservedBalance - amount)
 * 3. À l'échec: releaseReservation() → libère la réservation (balance + amount, reservedBalance - amount)
 */

export type ReserveResult =
  | { ok: true; balanceAfter: number; reservedBalance: number; reservationId: string }
  | { ok: false; reason: "insufficient_balance" };

// Emails qui bypassent le wallet (liste hardcodée + env var)
const FORCED_UNLIMITED = ["test@gmail.com"];

function isUnlimitedAdminEmail(email: string | null | undefined) {
  if (!email) return false;
  const normalized = email.toLowerCase();
  if (FORCED_UNLIMITED.includes(normalized)) return true;
  const raw = process.env.ADMIN_UNLIMITED_EMAILS ?? "";
  if (!raw.trim()) return false;
  const list = raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(normalized);
}

async function shouldBypassWallet(prisma: PrismaClient, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, role: true },
  });
  if (!user) return false;
  // Bypass si l'email est dans la liste unlimited (indépendamment du role en base)
  return isUnlimitedAdminEmail(user.email);
}

export async function ensureWallet(prisma: PrismaClient, userId: string) {
  let wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    // Vérifier si l'user est unlimited pour lui donner un solde de départ généreux
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const startBalance = isUnlimitedAdminEmail(user?.email) ? 999999 : 0;
    wallet = await prisma.wallet.create({
      data: { userId, balance: startBalance, lifetimePurchased: startBalance, lifetimeSpent: 0, lifetimeRefunded: 0 },
    });
  } else if (wallet.balance < 100) {
    // Si le wallet d'un admin unlimited est épuisé, le recharger automatiquement
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (isUnlimitedAdminEmail(user?.email)) {
      wallet = await prisma.wallet.update({
        where: { userId },
        data: { balance: 999999, lifetimePurchased: 999999 },
      });
    }
  }
  return wallet;
}

/**
 * P0.6 — Réserve des tokens pour un job.
 * La balance est décrémentée, reservedBalance est incrémenté.
 * Les tokens restent "bloqués" jusqu'à capture ou release.
 */
export async function reserveTokens(
  prisma: PrismaClient,
  userId: string,
  amount: number,
  reference?: { reason?: string; referenceType?: string; referenceId?: string; metadata?: Record<string, unknown> },
): Promise<ReserveResult> {
  if (await shouldBypassWallet(prisma, userId)) {
    return {
      ok: true,
      balanceAfter: Number.MAX_SAFE_INTEGER,
      reservedBalance: 0,
      reservationId: `admin_unlimited:${userId}:${Date.now()}`,
    };
  }
  return prisma.$transaction(async (tx) => {
    const w = await ensureWallet(tx as PrismaClient, userId);
    if (w.balance < amount) return { ok: false, reason: "insufficient_balance" };

    const balanceAfter = w.balance - amount;
    const reservedAfter = (w.reservedBalance ?? 0) + amount;

    const txEntry = await tx.walletTransaction.create({
      data: {
        walletId: w.id,
        type: "reserve" as WalletTransactionType,
        amount,
        balanceBefore: w.balance,
        balanceAfter,
        reservedBefore: w.reservedBalance ?? 0,
        reservedAfter,
        reason: reference?.reason ?? "job_reservation",
        referenceType: reference?.referenceType,
        referenceId: reference?.referenceId,
        status: "pending",
        metadata: (reference?.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    await tx.wallet.update({
      where: { userId },
      data: {
        balance: balanceAfter,
        reservedBalance: reservedAfter,
      },
    });

    return { ok: true, balanceAfter, reservedBalance: reservedAfter, reservationId: txEntry.id };
  });
}

export async function creditPurchase(
  prisma: PrismaClient,
  userId: string,
  tokensGranted: number,
  reference: { stripeCheckoutSessionId: string; packCode: string },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    let wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      wallet = await tx.wallet.create({
        data: { userId, balance: 0, lifetimePurchased: 0, lifetimeSpent: 0, lifetimeRefunded: 0 },
      });
    }
    const balanceAfter = wallet.balance + tokensGranted;
    await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        balance: balanceAfter,
        lifetimePurchased: { increment: tokensGranted },
      },
    });
    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: "purchase",
        amount: tokensGranted,
        balanceBefore: wallet.balance,
        balanceAfter,
        reason: `stripe:${reference.packCode}`,
        referenceType: "stripe_checkout",
        referenceId: reference.stripeCheckoutSessionId,
        metadata: {},
      },
    });
  });
}

/**
 * P0.6 — Capture une réservation (job réussi).
 * La reservedBalance est décrémentée, lifetimeSpent est incrémenté.
 * Si actualAmount < reservedAmount, le surplus est remboursé.
 * Si actualAmount > reservedAmount, on prélève le delta sur balance.
 */
export async function captureReservation(
  prisma: PrismaClient,
  userId: string,
  reservationId: string,
  actualAmount: number,
) {
  if (reservationId.startsWith("admin_unlimited:")) {
    return { ok: true as const, actualAmount, refunded: 0 };
  }
  return prisma.$transaction(async (tx) => {
    const wallet = await ensureWallet(tx as PrismaClient, userId);
    const reservation = await tx.walletTransaction.findUnique({
      where: { id: reservationId },
    });

    if (!reservation || reservation.walletId !== wallet.id) {
      throw new Error("reservation_not_found");
    }
    if (reservation.status !== "pending") {
      throw new Error(`reservation_already_${reservation.status}`);
    }

    const reservedAmount = reservation.amount;
    let refundedAmount = 0;

    // Marquer la réservation comme captured
    await tx.walletTransaction.update({
      where: { id: reservationId },
      data: { status: "captured" },
    });

    // Libérer la reservedBalance
    const reservedAfter = Math.max(0, (wallet.reservedBalance ?? 0) - reservedAmount);

    if (actualAmount < reservedAmount) {
      // Remboursement partiel
      refundedAmount = reservedAmount - actualAmount;
      const balanceAfter = wallet.balance + refundedAmount;

      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: balanceAfter,
          reservedBalance: reservedAfter,
          lifetimeSpent: { increment: actualAmount },
          lifetimeRefunded: { increment: refundedAmount },
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "release" as WalletTransactionType,
          amount: refundedAmount,
          balanceBefore: wallet.balance,
          balanceAfter,
          reservedBefore: wallet.reservedBalance ?? 0,
          reservedAfter,
          reason: "job_partial_refund",
          referenceType: "wallet_reservation",
          referenceId: reservationId,
          status: "completed",
          metadata: { actualAmount, reservedAmount },
        },
      });
    } else if (actualAmount > reservedAmount) {
      // Coût supplémentaire
      const delta = actualAmount - reservedAmount;
      if (wallet.balance < delta) {
        throw new Error("insufficient_balance_for_capture");
      }
      const balanceAfter = wallet.balance - delta;

      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: balanceAfter,
          reservedBalance: reservedAfter,
          lifetimeSpent: { increment: actualAmount },
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "capture" as WalletTransactionType,
          amount: delta,
          balanceBefore: wallet.balance,
          balanceAfter,
          reservedBefore: wallet.reservedBalance ?? 0,
          reservedAfter,
          reason: "job_additional_cost",
          referenceType: "wallet_reservation",
          referenceId: reservationId,
          status: "completed",
          metadata: { actualAmount, reservedAmount },
        },
      });
    } else {
      // Exactement le montant réservé
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          reservedBalance: reservedAfter,
          lifetimeSpent: { increment: actualAmount },
        },
      });
    }

    return { ok: true as const, actualAmount, refunded: refundedAmount };
  });
}

// Alias pour compatibilité
export const settleReservedTokens = captureReservation;

/**
 * P0.6 — Libère une réservation (job échoué).
 * Les tokens réservés sont remis dans balance.
 */
export async function releaseReservation(
  prisma: PrismaClient,
  userId: string,
  reservationId: string,
  reason = "job_failed",
) {
  if (reservationId.startsWith("admin_unlimited:")) {
    return { ok: true as const, releasedAmount: 0 };
  }
  return prisma.$transaction(async (tx) => {
    const wallet = await ensureWallet(tx as PrismaClient, userId);
    const reservation = await tx.walletTransaction.findUnique({
      where: { id: reservationId },
    });

    if (!reservation || reservation.walletId !== wallet.id) {
      throw new Error("reservation_not_found");
    }
    if (reservation.status !== "pending") {
      throw new Error(`reservation_already_${reservation.status}`);
    }

    const releasedAmount = reservation.amount;
    const balanceAfter = wallet.balance + releasedAmount;
    const reservedAfter = Math.max(0, (wallet.reservedBalance ?? 0) - releasedAmount);

    // Marquer la réservation comme released
    await tx.walletTransaction.update({
      where: { id: reservationId },
      data: { status: "released" },
    });

    await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        balance: balanceAfter,
        reservedBalance: reservedAfter,
        lifetimeRefunded: { increment: releasedAmount },
      },
    });

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: "release" as WalletTransactionType,
        amount: releasedAmount,
        balanceBefore: wallet.balance,
        balanceAfter,
        reservedBefore: wallet.reservedBalance ?? 0,
        reservedAfter,
        reason,
        referenceType: "wallet_reservation",
        referenceId: reservationId,
        status: "completed",
        metadata: {},
      },
    });

    return { ok: true as const, releasedAmount };
  });
}

// Alias pour compatibilité
export const refundReservation = releaseReservation;

export async function getWalletSummary(prisma: PrismaClient, userId: string) {
  const wallet = await ensureWallet(prisma, userId);
  const transactions = await prisma.walletTransaction.findMany({
    where: { walletId: wallet.id },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  return { wallet, transactions };
}
