-- policy_number was globally unique across ALL organizations, so two different
-- hospitals/tenants (or two different patients within the same org, via TPA
-- number reuse) could never share a policy number even though that's a valid
-- real-world scenario. Scope the uniqueness to (organizationId, policy_number)
-- instead. Idempotent.
DROP INDEX IF EXISTS "insurance_policies_policy_number_key";

CREATE UNIQUE INDEX IF NOT EXISTS "insurance_policies_organizationId_policy_number_key"
  ON "insurance_policies"("organizationId", "policy_number");
