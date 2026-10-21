# ADR-007 — Delegated administration without privilege escalation

**Status:** Accepted · 2026-10-21 · Plan §5 rule 7–8

## Decision
Assigning access is the scoped permission `admin.access.assign`. Admin templates: **Company owner** (everything entitled, COMPANY scope), **Unit admin** (everything enabled in their unit — today's `admin`), **Module admin** (e.g. HR Admin: `hr.*` + assign limited to HR roles).

Rules: a grantor may assign only roles/permissions they hold, only in units they administer, and **never to themselves**. A break-glass company-owner account exists per company.

## Consequences
- Delegated-admin tests are mandatory in Phase 4 (cannot exceed own permissions; cannot edit own access; unit admin cannot touch other units).
- `admin` remains all-powerful *within its scope* — it does not become cross-company.
