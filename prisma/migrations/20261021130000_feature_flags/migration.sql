-- Feature flags for staged rollouts (Company-OS Phase 0). Purely additive: a new table
-- nothing reads until app/lib/feature-flags.ts is called, and that helper treats a missing
-- row or missing table as "use the code default" (access_engine = legacy).
CREATE TABLE IF NOT EXISTS "feature_flags" (
    "scope_type" TEXT NOT NULL,
    "scope_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("scope_type", "scope_id", "key")
);
