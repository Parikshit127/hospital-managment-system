-- HR mobile app: one row per logged-in phone. Additive (new table only).
CREATE TABLE IF NOT EXISTS "mobile_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "device_name" TEXT,
    "platform" TEXT,
    "app_version" TEXT,
    "refresh_hash" TEXT NOT NULL,
    "prev_refresh_hash" TEXT,
    "login_lat" DOUBLE PRECISION,
    "login_lng" DOUBLE PRECISION,
    "login_accuracy_m" DOUBLE PRECISION,
    "login_ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" TEXT,

    CONSTRAINT "mobile_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mobile_sessions_refresh_hash_key" ON "mobile_sessions"("refresh_hash");
CREATE INDEX IF NOT EXISTS "mobile_sessions_user_id_revoked_at_idx" ON "mobile_sessions"("user_id", "revoked_at");
CREATE INDEX IF NOT EXISTS "mobile_sessions_org_id_idx" ON "mobile_sessions"("org_id");

ALTER TABLE "mobile_sessions" DROP CONSTRAINT IF EXISTS "mobile_sessions_user_id_fkey";
ALTER TABLE "mobile_sessions" ADD CONSTRAINT "mobile_sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
