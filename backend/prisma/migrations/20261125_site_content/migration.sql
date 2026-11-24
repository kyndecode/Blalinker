-- Lot 2 — contenus administrables (pages, FAQ, annonces, paramètres, pays, médias).
-- Migration ADDITIVE uniquement : création d'un type et de 6 tables neuves, aucune
-- table existante modifiée, aucune donnée insérée ni supprimée.

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('draft', 'published', 'unpublished');

-- CreateTable
CREATE TABLE "content_pages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(100) NOT NULL,
    "locale" VARCHAR(10) NOT NULL DEFAULT 'fr',
    "title" VARCHAR(200) NOT NULL,
    "summary" VARCHAR(500),
    "body" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMP(3),
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faq_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "locale" VARCHAR(10) NOT NULL DEFAULT 'fr',
    "category" VARCHAR(100),
    "question" VARCHAR(300) NOT NULL,
    "answer" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faq_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "message" VARCHAR(300) NOT NULL,
    "link_url" VARCHAR(500),
    "link_label" VARCHAR(100),
    "level" VARCHAR(20) NOT NULL DEFAULT 'info',
    "locale" VARCHAR(10),
    "country_code" VARCHAR(2),
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" VARCHAR(100) NOT NULL,
    "scope" VARCHAR(10) NOT NULL DEFAULT 'global',
    "value" JSONB NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "countries" (
    "code" VARCHAR(2) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "dial_code" VARCHAR(6) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "default_locale" VARCHAR(10) NOT NULL DEFAULT 'fr',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "url" VARCHAR(500) NOT NULL,
    "public_id" VARCHAR(300),
    "mime_type" VARCHAR(100),
    "bytes" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "alt" VARCHAR(200),
    "uploaded_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_pages_status_idx" ON "content_pages"("status");

-- CreateIndex
CREATE UNIQUE INDEX "content_pages_slug_locale_key" ON "content_pages"("slug", "locale");

-- CreateIndex
CREATE INDEX "faq_items_locale_status_sort_order_idx" ON "faq_items"("locale", "status", "sort_order");

-- CreateIndex
CREATE INDEX "announcements_status_starts_at_ends_at_idx" ON "announcements"("status", "starts_at", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "site_settings_key_scope_key" ON "site_settings"("key", "scope");

-- CreateIndex
CREATE INDEX "media_assets_deleted_at_idx" ON "media_assets"("deleted_at");

