import type { PrismaClient, WalletTransactionType } from "@manga-ai-studio/db";

export type ReserveResult =
  | { ok: true; balanceAfter: number; reservationId: string }
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

export async function reserveTokens(
  prisma: PrismaClient,
  userId: string,
  amount: number,
  reference?: { reason?: string; referenceType?: string; referenceId?: string; metadata?: Record<string, unknown> },
): Promise<ReserveResult> {
  if (await shouldBypassWallet(prisma, userId)) {
    return { ok: true, balanceAfter: Number.MAX_SAFE_INTEGER, reservationId: `admin_unlimited:${userId}:${Date.now()}` };
  }
  return prisma.$transaction(async (tx) => {
    const w = await ensureWallet(tx as PrismaClient, userId);
    if (w.balance < amount) return { ok: false, reason: "insufficient_balance" };
    const balanceAfter = w.balance - amount;

    const txEntry = await tx.walletTransaction.create({
      data: {
        walletId: w.id,
        type: "debit" as WalletTransactionType,
        amount,
        balanceBefore: w.balance,
        balanceAfter,
        reason: reference?.reason ?? "job_reservation",
        referenceType: reference?.referenceType,
        referenceId: reference?.referenceId,
        metadata: { status: "reserved", ...(reference?.metadata ?? {}) },
      },
    });

    await tx.wallet.update({
      where: { userId },
      data: { balance: balanceAfter, lifetimeSpent: { increment: amount } },
    });
    return { ok: true, balanceAfter, reservationId: txEntry.id };
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

export async function settleReservedTokens(
  prisma: PrismaClient,
  userId: string,
  reservationId: string,
  actualAmount: number,
) {
  if (reservationId.startsWith("admin_unlimited:")) {
    return { ok: true as const, actualAmount };
  }
  return prisma.$transaction(async (tx) => {
    const wallet = await ensureWallet(tx as PrismaClient, userId);
    const reservation = await tx.walletTransaction.findUnique({
      where: { id: reservationId },
    });

    if (!reservation || reservation.walletId !== wallet.id) {
      throw new Error("reservation_not_found");
    }

    const reservedAmount = reservation.amount;

    if (actualAmount < reservedAmount) {
      const refundAmount = reservedAmount - actualAmount;
      const balanceAfter = wallet.balance + refundAmount;
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: balanceAfter,
          lifetimeSpent: { decrement: refundAmount },
          lifetimeRefunded: { increment: refundAmount },
        },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "refund" as WalletTransactionType,
          amount: refundAmount,
          balanceBefore: wallet.balance,
          balanceAfter,
          reason: "job_partial_refund",
          referenceType: "wallet_reservation",
          referenceId: reservationId,
          metadata: { status: "settled", actualAmount, reservedAmount },
        },
      });
    } else if (actualAmount > reservedAmount) {
      const delta = actualAmount - reservedAmount;
      if (wallet.balance < delta) {
        throw new Error("insufficient_balance_for_capture");
      }
      const balanceAfter = wallet.balance - delta;
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: balanceAfter,
          lifetimeSpent: { increment: delta },
        },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "debit" as WalletTransactionType,
          amount: delta,
          balanceBefore: wallet.balance,
          balanceAfter,
          reason: "job_capture_delta",
          referenceType: "wallet_reservation",
          referenceId: reservationId,
          metadata: { status: "settled", actualAmount, reservedAmount },
        },
      });
    }

    return { ok: true as const, actualAmount };
  });
}

export async function refundReservation(
  prisma: PrismaClient,
  userId: string,
  reservationId: string,
  reason = "job_failed_refund",
) {
  if (reservationId.startsWith("admin_unlimited:")) {
    return { ok: true as const, refundedAmount: 0 };
  }
  return prisma.$transaction(async (tx) => {
    const wallet = await ensureWallet(tx as PrismaClient, userId);
    const reservation = await tx.walletTransaction.findUnique({
      where: { id: reservationId },
    });

    if (!reservation || reservation.walletId !== wallet.id) {
      throw new Error("reservation_not_found");
    }

    const balanceAfter = wallet.balance + reservation.amount;
    await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        balance: balanceAfter,
        lifetimeSpent: { decrement: reservation.amount },
        lifetimeRefunded: { increment: reservation.amount },
      },
    });
    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: "refund" as WalletTransactionType,
        amount: reservation.amount,
        balanceBefore: wallet.balance,
        balanceAfter,
        reason,
        referenceType: "wallet_reservation",
        referenceId: reservationId,
        metadata: { status: "refunded" },
      },
    });

    return { ok: true as const, refundedAmount: reservation.amount };
  });
}

export async function getWalletSummary(prisma: PrismaClient, userId: string) {
  const wallet = await ensureWallet(prisma, userId);
  const transactions = await prisma.walletTransaction.findMany({
    where: { walletId: wallet.id },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  return { wallet, transactions };
}
