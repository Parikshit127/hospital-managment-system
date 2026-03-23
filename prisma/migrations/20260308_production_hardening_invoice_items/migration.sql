-- HospitalOS production hardening migration
-- Run in staging first, then production during a maintenance window.

BEGIN;

ALTER TABLE "invoice_items"
    ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

UPDATE "invoice_items" ii
SET "organizationId" = i."organizationId"
FROM "invoices" i
WHERE ii."invoice_id" = i."id"
  AND ii."organizationId" IS NULL;

ALTER TABLE "invoice_items"
    ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "payments"
    ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

UPDATE "payments" p
SET "organizationId" = i."organizationId"
FROM "invoices" i
WHERE p."invoice_id" = i."id"
  AND p."organizationId" IS NULL;

ALTER TABLE "payments"
    ALTER COLUMN "organizationId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "invoice_items_organizationId_idx" ON "invoice_items"("organizationId");
CREATE INDEX IF NOT EXISTS "payments_organizationId_idx" ON "payments"("organizationId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'invoice_items_organization_fk'
    ) THEN
        ALTER TABLE "invoice_items"
            ADD CONSTRAINT "invoice_items_organization_fk"
            FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payments_organization_fk'
    ) THEN
        ALTER TABLE "payments"
            ADD CONSTRAINT "payments_organization_fk"
            FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

ALTER TABLE "user_mfa"
    ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

CREATE INDEX IF NOT EXISTS "user_mfa_organizationId_idx" ON "user_mfa"("organizationId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_mfa_organization_fk'
    ) THEN
        ALTER TABLE "user_mfa"
            ADD CONSTRAINT "user_mfa_organization_fk"
            FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "payment_order_intents" (
    "id" TEXT PRIMARY KEY,
    "razorpay_order_id" TEXT NOT NULL UNIQUE,
    "invoice_id" INTEGER NOT NULL,
    "expected_amount" DECIMAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "organizationId" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "verified_at" TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS "payment_order_intents_org_invoice_idx"
    ON "payment_order_intents"("organizationId", "invoice_id");
CREATE INDEX IF NOT EXISTS "payment_order_intents_status_expiry_idx"
    ON "payment_order_intents"("status", "expires_at");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payment_order_intents_invoice_fk'
    ) THEN
        ALTER TABLE "payment_order_intents"
            ADD CONSTRAINT "payment_order_intents_invoice_fk"
            FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payment_order_intents_org_fk'
    ) THEN
        ALTER TABLE "payment_order_intents"
            ADD CONSTRAINT "payment_order_intents_org_fk"
            FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "patient_password_setup_tokens" (
    "id" TEXT PRIMARY KEY,
    "token_hash" TEXT NOT NULL UNIQUE,
    "patient_id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "patient_password_setup_tokens_patient_org_idx"
    ON "patient_password_setup_tokens"("patient_id", "organizationId");
CREATE INDEX IF NOT EXISTS "patient_password_setup_tokens_expiry_idx"
    ON "patient_password_setup_tokens"("expires_at");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'patient_password_setup_tokens_patient_fk'
    ) THEN
        ALTER TABLE "patient_password_setup_tokens"
            ADD CONSTRAINT "patient_password_setup_tokens_patient_fk"
            FOREIGN KEY ("patient_id") REFERENCES "OPD_REG"("patient_id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'patient_password_setup_tokens_org_fk'
    ) THEN
        ALTER TABLE "patient_password_setup_tokens"
            ADD CONSTRAINT "patient_password_setup_tokens_org_fk"
            FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

COMMIT;

