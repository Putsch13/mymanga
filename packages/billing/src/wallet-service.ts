import type { PrismaClient, WalletTransactionType } from "@manga-ai-studio/db";

export type ReserveResult =
  | { ok: true; balanceAfter: number }
  | { ok: false; reason: "insufficient_balance" };

/**
 * Ledger wallet : réserver puis débiter (PDF §7.7).
 */
export async function reserveTokens(
  prisma: PrismaClient,
  userId: string,
  amount: number,
): Promise<ReserveResult> {
  return prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      await tx.wallet.create({
        data: { userId, balance: 0, lifetimePurchased: 0, lifetimeSpent: 0, lifetimeRefunded: 0 },
      });
    }
    const w = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    if (w.balance < amount) return { ok: false, reason: "insufficient_balance" };
    const balanceAfter = w.balance - amount;
    await tx.wallet.update({
      where: { userId },
      data: { balance: balanceAfter, lifetimeSpent: { increment: amount } },
    });
    await tx.walletTransaction.create({
      data: {
        walletId: w.id,
        type: "debit" as WalletTransactionType,
        amount,
        balanceBefore: w.balance,
        balanceAfter,
        reason: "reservation_job",
        metadata: {},
      },
    });
    return { ok: true, balanceAfter };
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
