-- RBAC : permissions granulaires + libellé de rôle admin
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "permissions" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "admin_title" VARCHAR(100);
