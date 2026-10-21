# ADR-002 — Every staff login is an Employee

**Status:** Accepted · 2026-10-21 · Plan §4

## Context
`User` mixes credentials with person data (specialty, fees, designation…); `Employee` is a separate optional profile used by HR.

## Decision
Every staff login maps 1:1 to an `Employee`. `User` holds only credentials (username, password hash, MFA, status). Person data (department, designation, manager, home unit, employment type) lives on `Employee`.

## Consequences
- Attendance, leave, payroll and approvals share one person record.
- Contractors and visiting consultants get an `Employee` with `employment_type`.
- Patients, investors, dev-portal users and superadmins are NOT employees.
- Existing `User` clinical columns stay in place until a later cleanup; do not move them in Phases 0–4.
