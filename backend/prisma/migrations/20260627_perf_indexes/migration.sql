-- Index de performance
-- Lookups fréquents des webhooks/verify de paiement par référence externe
CREATE INDEX IF NOT EXISTS "transactions_external_ref_idx" ON "transactions"("external_ref");

-- Filtres de modération admin sur les signalements
CREATE INDEX IF NOT EXISTS "reports_status_idx" ON "reports"("status");
CREATE INDEX IF NOT EXISTS "reports_reported_id_idx" ON "reports"("reported_id");
