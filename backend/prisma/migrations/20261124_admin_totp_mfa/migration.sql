-- MFA TOTP de l'administration (phase 3b) — migration ADDITIVE uniquement :
-- deux colonnes facultatives sur users et une nouvelle table. Aucune donnée
-- existante n'est modifiée ni supprimée. La colonne existante users.mfa_secret
-- (jusqu'ici inutilisée) reçoit le secret TOTP chiffré.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mfa_totp_enabled_at" TIMESTAMP(3),
ADD COLUMN     "mfa_totp_last_step" INTEGER;

-- CreateTable
CREATE TABLE "mfa_recovery_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mfa_recovery_codes_user_id_idx" ON "mfa_recovery_codes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "mfa_recovery_codes_user_id_code_hash_key" ON "mfa_recovery_codes"("user_id", "code_hash");

-- AddForeignKey
ALTER TABLE "mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

