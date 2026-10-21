# ADR-006 — Per-user grant/deny overrides

**Status:** Accepted · 2026-10-21 · Plan §5, §6

## Decision
`UserPermissionOverride(user, permission_key, effect GRANT|DENY, scope?, unit?, expires_at?, reason, granted_by)`. **Deny wins** over any grant. A reason is mandatory; expiry is optional. Every create/expire/revoke writes `AccessChangeLog`.

## Consequences
- One-off exceptions don't require new roles.
- The effective-access view and "View as this user" must show the source of each permission (role vs grant vs deny).
