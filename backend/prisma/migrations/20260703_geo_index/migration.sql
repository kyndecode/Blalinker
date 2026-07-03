-- Index géo pour accélérer le pré-filtre bounding-box de la recherche prestataires
CREATE INDEX IF NOT EXISTS "profiles_latitude_longitude_idx" ON "profiles"("latitude", "longitude");
