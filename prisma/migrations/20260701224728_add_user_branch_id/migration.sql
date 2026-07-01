-- Additive: optional facility linkage for users, used to resolve FACILITY-audience
-- broadcasts. Nullable; must be populated via user management for FACILITY
-- targeting to reach users.
ALTER TABLE "users" ADD COLUMN "branch_id" TEXT;

CREATE INDEX "users_branch_id_idx" ON "users"("branch_id");
