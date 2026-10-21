# ADR-008 — Modular monolith in the same Next.js app

**Status:** Accepted · 2026-10-21 · Plan §3

## Decision
Keep one Next.js app. Layers: core → business apps → industry packs; **calls go downward only**. Cross-module calls go through a module's public service functions, never its tables (e.g. IPD discharge calls `finance.postJournal()`, never writes `GL_JournalLine`). Boundaries are enforced by lint rules generated from each module's `layer` in the registry.

## Consequences
- No network boundaries, no new deploy units.
- Folder moves (`modules/<key>/…`) happen only after a module's guards are migrated and green.
- Internal service functions (called by cron, webhooks, other modules) are separated from user-facing server actions so guards can be added to the latter without breaking the former (see Phase 0 finding on `gl-actions`, `budget-actions`, `asset-management-actions`).
