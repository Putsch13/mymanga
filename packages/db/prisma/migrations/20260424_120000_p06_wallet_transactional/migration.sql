-- P0.6 — Wallet transactionnel reserve/capture/release

-- Ajouter les nouveaux types de transaction
ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'reserve';
ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'capture';
ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'release';

-- Ajouter reservedBalance à Wallet
ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS "reservedBalance" INTEGER NOT NULL DEFAULT 0;

-- Ajouter les colonnes réservation à WalletTransaction
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "reservedBefore" INTEGER;
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "reservedAfter" INTEGER;
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'completed';

-- Ajouter les index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS "WalletTransaction_walletId_status_idx" ON "WalletTransaction"("walletId", "status");
CREATE INDEX IF NOT EXISTS "WalletTransaction_referenceType_referenceId_idx" ON "WalletTransaction"("referenceType", "referenceId");
