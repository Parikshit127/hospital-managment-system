# ADR-001 — Tenant boundary: Company above Organization

**Status:** Accepted · 2026-10-21 · Plan: `docs/COMPANY_OS_PLAN.md` §2, §4

## Context
200+ tables carry `organizationId`. `Organization` currently means "a hospital/unit" and is the unit of data isolation (`getTenantPrisma`).

## Decision
Introduce a new `Company` above `Organization`. `Organization` keeps its table, ids and meaning but is now called a **unit** in product language. Company-level data (employees, payroll, ledger, approvals) is scoped by `company_id`; operational data stays scoped by `organizationId`.

## Consequences
- No re-keying of existing tables; additive migration only.
- Every model must be tagged company-scoped or unit-scoped (CI check).
- Until Phase 2 lands, one `Company` per `Organization` is the default mapping.

## Rejected
Renaming `Organization` → `Company` and adding `Unit`: rewrites every `organizationId` reference on a live system.
