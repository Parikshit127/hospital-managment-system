# ADR-005 — Permission grain: module.resource.action + data scope

**Status:** Accepted · 2026-10-21 · Plan §5

## Context
Today only `<module>.view` is checked at route level; `create/edit/delete/approve/export` are almost never checked, and there is no notion of "my records vs everyone's".

## Decision
Permission key = `<module>.<resource>.<action>` (e.g. `hr.leave.approve`). Each role permission carries a **data scope**: `OWN < TEAM < DEPARTMENT < UNIT < COMPANY`. Widest scope wins across roles/grants; deny beats grant.

## Consequences
- Sensitive fields get their own permissions (`hr.salary.view`, `clinical.record.view`).
- Every model declares owner fields in the registry so `scopeWhere()` can build filters.
- Legacy `*.view` strings are mapped to new keys by generators during Phases 1–3 (parity-tested).
