# ADR-004 — Many roles per user, each tied to a unit

**Status:** Accepted · 2026-10-21 · Plan §5, §6

## Context
`User.role` is a single string; `UserUnitAccess` only widens which units an admin may switch into.

## Decision
`UserRole(user, role, unit | null, is_primary, valid_from/to, granted_by)`. `unit = null` means all units of the company. `User.role` remains as a LEGACY read-only column after Phase 4.

## Consequences
- Doctor + HOD; billing in unit A and reception in unit B become expressible.
- The unit switcher lists units where the user holds a role.
- `UserUnitAccess` is retired after backfill (Phase 2) and cut-over (Phase 4).
