-- Escrow + retraits prestataires

-- Colonnes escrow sur les transactions
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "released_at" TIMESTAMP(3);
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "payout_id" UUID;

-- Table des retraits (payouts)
CREATE TABLE IF NOT EXISTS "payouts" (
  "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
  "provider_id"  UUID NOT NULL,
  "amount"       DECIMAL(12,2) NOT NULL,
  "currency"     VARCHAR(10) NOT NULL DEFAULT 'XOF',
  "method"       VARCHAR(30),
  "destination"  VARCHAR(200),
  "status"       VARCHAR(20) NOT NULL DEFAULT 'pending',
  "reference"    VARCHAR(100),
  "note"         TEXT,
  "processed_by" UUID,
  "processed_at" TIMESTAMP(3),
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "payouts_provider_id_idx" ON "payouts"("provider_id");
CREATE INDEX IF NOT EXISTS "payouts_status_idx" ON "payouts"("status");
CREATE INDEX IF NOT EXISTS "transactions_payout_id_idx" ON "transactions"("payout_id");

-- Clés étrangères
DO $$ BEGIN
  ALTER TABLE "payouts" ADD CONSTRAINT "payouts_provider_id_fkey"
    FOREIGN KEY ("provider_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payout_id_fkey"
    FOREIGN KEY ("payout_id") REFERENCES "payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
