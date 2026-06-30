-- Ajout de la réponse du prestataire à un avis
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "response" TEXT;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "response_at" TIMESTAMP(3);
