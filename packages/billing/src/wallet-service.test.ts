/**
 * P0.6 — Tests du wallet transactionnel reserve/capture/release.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockWallet = vi.fn();
const mockWalletTransaction = vi.fn();
const mockUser = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@manga-ai-studio/db", () => ({
  default: {},
}));

import {
  reserveTokens,
  captureReservation,
  releaseReservation,
} from "./wallet-service";

function createMockPrisma(initialWallet: {
  id: string;
  userId: string;
  balance: number;
  reservedBalance: number;
}) {
  let wallet = { ...initialWallet };
  const transactions: Array<{ id: string; amount: number; status: string; walletId: string }> = [];

  return {
    $transaction: vi.fn(async (fn) => fn({
      wallet: {
        findUnique: vi.fn(async () => wallet),
        create: vi.fn(async (args) => {
          wallet = { ...args.data, id: "wallet-1", reservedBalance: 0 };
          return wallet;
        }),
        update: vi.fn(async (args) => {
          if (args.data.balance !== undefined) wallet.balance = args.data.balance;
          if (args.data.reservedBalance !== undefined) wallet.reservedBalance = args.data.reservedBalance;
          if (args.data.lifetimeSpent?.increment) wallet.balance = wallet.balance;
          return wallet;
        }),
      },
      walletTransaction: {
        create: vi.fn(async (args) => {
          const tx = { id: `tx-${transactions.length + 1}`, ...args.data };
          transactions.push(tx);
          return tx;
        }),
        findUnique: vi.fn(async ({ where }) => transactions.find((t) => t.id === where.id)),
        update: vi.fn(async ({ where, data }) => {
          const tx = transactions.find((t) => t.id === where.id);
          if (tx && data.status) tx.status = data.status;
          return tx;
        }),
      },
      user: {
        findUnique: vi.fn(async () => ({ email: "user@test.com" })),
      },
    })),
    wallet: {
      findUnique: vi.fn(async () => wallet),
      create: vi.fn(async (args) => {
        wallet = { ...args.data, id: "wallet-1", reservedBalance: 0 };
        return wallet;
      }),
    },
    user: {
      findUnique: vi.fn(async () => ({ email: "user@test.com" })),
    },
    _getTransactions: () => transactions,
    _getWallet: () => wallet,
  };
}

describe("P0.6 — Wallet transactionnel", () => {
  it("reserveTokens bloque si balance insuffisante", async () => {
    const prisma = createMockPrisma({
      id: "wallet-1",
      userId: "user-1",
      balance: 50,
      reservedBalance: 0,
    });

    const result = await reserveTokens(
      prisma as any,
      "user-1",
      100,
      { reason: "test_job", referenceType: "job", referenceId: "job-1" },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("insufficient_balance");
    }
  });

  it("reserveTokens crée une réservation pending", async () => {
    const prisma = createMockPrisma({
      id: "wallet-1",
      userId: "user-1",
      balance: 200,
      reservedBalance: 0,
    });

    const result = await reserveTokens(
      prisma as any,
      "user-1",
      100,
      { reason: "test_job", referenceType: "job", referenceId: "job-1" },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.balanceAfter).toBe(100);
      expect(result.reservedBalance).toBe(100);
      expect(result.reservationId).toBeDefined();
    }
  });

  it("captureReservation confirme la dépense", async () => {
    const prisma = createMockPrisma({
      id: "wallet-1",
      userId: "user-1",
      balance: 100,
      reservedBalance: 100,
    });

    // Simuler une réservation existante
    const reserveResult = await reserveTokens(
      prisma as any,
      "user-1",
      0,
      { reason: "setup" },
    );

    // On simule manuellement une transaction pending
    prisma._getTransactions().push({
      id: "reservation-1",
      amount: 100,
      status: "pending",
      walletId: "wallet-1",
    });

    const captureResult = await captureReservation(
      prisma as any,
      "user-1",
      "reservation-1",
      100,
    );

    expect(captureResult.ok).toBe(true);
    expect(captureResult.actualAmount).toBe(100);
  });

  it("releaseReservation rembourse les tokens", async () => {
    const prisma = createMockPrisma({
      id: "wallet-1",
      userId: "user-1",
      balance: 100,
      reservedBalance: 100,
    });

    prisma._getTransactions().push({
      id: "reservation-2",
      amount: 100,
      status: "pending",
      walletId: "wallet-1",
    });

    const releaseResult = await releaseReservation(
      prisma as any,
      "user-1",
      "reservation-2",
      "job_failed",
    );

    expect(releaseResult.ok).toBe(true);
    expect(releaseResult.releasedAmount).toBe(100);
  });

  it("bypass wallet pour admin unlimited", async () => {
    const prisma = {
      $transaction: vi.fn(),
      user: {
        findUnique: vi.fn(async () => ({ email: "test@gmail.com", role: "user" })),
      },
    };

    const result = await reserveTokens(
      prisma as any,
      "admin-user",
      1000000,
      { reason: "big_job" },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reservationId).toContain("admin_unlimited");
    }
  });
});
