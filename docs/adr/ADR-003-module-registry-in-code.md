# ADR-003 — Module definitions live in code; the DB stores assignments

**Status:** Accepted · 2026-10-21 · Plan §5, §7.1

## Context
Module keys are scattered strings today (`MODULE_KEYS` in `module-config-actions.ts`, `ROLE_ROUTES` in `proxy.ts`, `NAV_BY_ROLE` in the sidebar). `ModuleConfig.enabled` is never enforced.

## Decision
A typed registry (`app/lib/modules/registry.ts`, edge-safe) is the single source of truth for modules, resources, actions, route prefixes, nav, dependencies and model ownership. The DB stores only *assignments*: company entitlements, per-unit enablement, role permissions, user roles/overrides.

## Consequences
- Registry is versioned with code and testable in CI (route coverage, permission-string coverage).
- Proxy, sidebar, server guards and the admin UI are all generated from it.
- Adding a module = adding a registry entry + guards + tests.
