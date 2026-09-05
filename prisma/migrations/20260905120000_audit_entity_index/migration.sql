-- Per-entity audit lookup for the IPD admission trail ("who changed what").
-- system_audit_logs is indexed on organizationId / action / module / created_at,
-- but never on the entity it describes, so "all rows for this admission" was a scan.
--
-- Plain CREATE INDEX: Prisma wraps migrations in a transaction and
-- CREATE INDEX CONCURRENTLY cannot run inside one. On the production AWS box,
-- where system_audit_logs is large enough for the write lock to matter, run
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "system_audit_logs_entity_type_entity_id_idx"
--     ON "system_audit_logs" ("entity_type", "entity_id");
-- by hand first, then `prisma migrate resolve --applied 20260905120000_audit_entity_index`.
CREATE INDEX IF NOT EXISTS "system_audit_logs_entity_type_entity_id_idx"
  ON "system_audit_logs" ("entity_type", "entity_id");
