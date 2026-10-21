-- Company-OS Phase 2 (docs/COMPANY_OS_PLAN.md §6): company, people masters, access tables.
--
-- PURELY ADDITIVE and inert: new tables, new NULLABLE columns, new indexes/FKs that no existing
-- row can violate (every new FK column starts NULL). Nothing in the running app reads any of it
-- until scripts/backfill-company-os.ts is run and Phase 3 switches the access engine on.
-- No existing column, table, index or constraint is changed or dropped.
--
-- Written by hand from `prisma migrate diff` and made idempotent (safe to re-run). Apply with
-- `prisma migrate deploy` — never `migrate dev` (shared dev DB has drift).

DO $$ BEGIN
    CREATE TYPE "DataScope" AS ENUM ('OWN', 'TEAM', 'DEPARTMENT', 'UNIT', 'COMPANY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "OverrideEffect" AS ENUM ('GRANT', 'DENY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "UnitType" AS ENUM ('hospital', 'clinic', 'pharmacy', 'office', 'warehouse', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "company_id" TEXT,
ADD COLUMN IF NOT EXISTS "unit_type" "UnitType" NOT NULL DEFAULT 'hospital';

ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "company_id" TEXT,
ADD COLUMN IF NOT EXISTS "template_key" TEXT,
ADD COLUMN IF NOT EXISTS "unit_id" TEXT;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "access_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS "company_id" TEXT,
ADD COLUMN IF NOT EXISTS "home_app" TEXT;

ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "company_id" TEXT,
ADD COLUMN IF NOT EXISTS "designation_id" TEXT,
ADD COLUMN IF NOT EXISTS "org_department_id" TEXT;

CREATE TABLE IF NOT EXISTS "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "login_domain" TEXT,
    "plan_id" TEXT,
    "module_version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "legal_entities" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "pan" TEXT,
    "pf_code" TEXT,
    "esi_code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "legal_entities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "org_departments" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "parent_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "org_departments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "designations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "level" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "designations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "role_permissions" (
    "role_id" TEXT NOT NULL,
    "permission_key" TEXT NOT NULL,
    "scope" "DataScope" NOT NULL DEFAULT 'UNIT',
    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_key")
);

CREATE TABLE IF NOT EXISTS "user_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "unit_id" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMP(3),
    "granted_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "user_permission_overrides" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "permission_key" TEXT NOT NULL,
    "effect" "OverrideEffect" NOT NULL,
    "scope" "DataScope",
    "unit_id" TEXT,
    "expires_at" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "granted_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "company_modules" (
    "company_id" TEXT NOT NULL,
    "module_key" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'plan',
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "company_modules_pkey" PRIMARY KEY ("company_id","module_key")
);

CREATE TABLE IF NOT EXISTS "access_change_logs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "target_user_id" TEXT,
    "change" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "access_change_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "access_shadow_logs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "legacy" BOOLEAN NOT NULL,
    "next" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "access_shadow_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "companies_slug_key" ON "companies"("slug");

CREATE UNIQUE INDEX IF NOT EXISTS "companies_login_domain_key" ON "companies"("login_domain");

CREATE INDEX IF NOT EXISTS "legal_entities_company_id_idx" ON "legal_entities"("company_id");

CREATE INDEX IF NOT EXISTS "org_departments_company_id_idx" ON "org_departments"("company_id");

CREATE UNIQUE INDEX IF NOT EXISTS "org_departments_company_id_name_key" ON "org_departments"("company_id", "name");

CREATE INDEX IF NOT EXISTS "designations_company_id_idx" ON "designations"("company_id");

CREATE UNIQUE INDEX IF NOT EXISTS "designations_company_id_name_key" ON "designations"("company_id", "name");

CREATE INDEX IF NOT EXISTS "user_roles_user_id_idx" ON "user_roles"("user_id");

CREATE INDEX IF NOT EXISTS "user_roles_role_id_idx" ON "user_roles"("role_id");

CREATE INDEX IF NOT EXISTS "user_roles_unit_id_idx" ON "user_roles"("unit_id");

CREATE UNIQUE INDEX IF NOT EXISTS "user_roles_user_id_role_id_unit_id_key" ON "user_roles"("user_id", "role_id", "unit_id");

CREATE INDEX IF NOT EXISTS "user_permission_overrides_user_id_idx" ON "user_permission_overrides"("user_id");

CREATE INDEX IF NOT EXISTS "access_change_logs_company_id_created_at_idx" ON "access_change_logs"("company_id", "created_at");

CREATE INDEX IF NOT EXISTS "access_change_logs_target_user_id_idx" ON "access_change_logs"("target_user_id");

CREATE INDEX IF NOT EXISTS "access_shadow_logs_company_id_created_at_idx" ON "access_shadow_logs"("company_id", "created_at");

CREATE INDEX IF NOT EXISTS "organizations_company_id_idx" ON "organizations"("company_id");

CREATE INDEX IF NOT EXISTS "roles_company_id_idx" ON "roles"("company_id");

CREATE INDEX IF NOT EXISTS "users_company_id_idx" ON "users"("company_id");

CREATE UNIQUE INDEX IF NOT EXISTS "users_company_id_username_key" ON "users"("company_id", "username");

CREATE INDEX IF NOT EXISTS "employees_company_id_idx" ON "employees"("company_id");

CREATE INDEX IF NOT EXISTS "employees_org_department_id_idx" ON "employees"("org_department_id");

CREATE INDEX IF NOT EXISTS "employees_designation_id_idx" ON "employees"("designation_id");

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_company_id_fkey') THEN
        ALTER TABLE "organizations" ADD CONSTRAINT "organizations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'roles_company_id_fkey') THEN
        ALTER TABLE "roles" ADD CONSTRAINT "roles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_company_id_fkey') THEN
        ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_company_id_fkey') THEN
        ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_org_department_id_fkey') THEN
        ALTER TABLE "employees" ADD CONSTRAINT "employees_org_department_id_fkey" FOREIGN KEY ("org_department_id") REFERENCES "org_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_designation_id_fkey') THEN
        ALTER TABLE "employees" ADD CONSTRAINT "employees_designation_id_fkey" FOREIGN KEY ("designation_id") REFERENCES "designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'legal_entities_company_id_fkey') THEN
        ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'org_departments_company_id_fkey') THEN
        ALTER TABLE "org_departments" ADD CONSTRAINT "org_departments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'org_departments_parent_id_fkey') THEN
        ALTER TABLE "org_departments" ADD CONSTRAINT "org_departments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "org_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'designations_company_id_fkey') THEN
        ALTER TABLE "designations" ADD CONSTRAINT "designations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_permissions_role_id_fkey') THEN
        ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_user_id_fkey') THEN
        ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_role_id_fkey') THEN
        ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_unit_id_fkey') THEN
        ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_permission_overrides_user_id_fkey') THEN
        ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_modules_company_id_fkey') THEN
        ALTER TABLE "company_modules" ADD CONSTRAINT "company_modules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
