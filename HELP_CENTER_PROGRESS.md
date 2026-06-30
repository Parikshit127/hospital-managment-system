# Help Center — Hospital Portal UI Progress

> Last updated: 2026-06-30T14:38 IST

## Investigation Summary

### Schema (prisma/schema.prisma lines 2264–2297)
| Field | Type | Notes |
|-------|------|-------|
| `id` | String (uuid) | Auto-generated PK |
| `title` | String | Maps to "Summary" in spec |
| `description` | String | Maps to "Detailed Description" |
| `priority` | `TicketPriority` enum | Low, Medium, High, Critical |
| `status` | `TicketStatus` enum | Open, InProgress (mapped to `in_progress`), Resolved |
| `user_id` | String → User | FK to users table |
| `branch_id` | String → Branch | FK to branches table (≈ "facility") |
| `organizationId` | String → Organization | Tenant scoping |
| `created_at` | DateTime | Auto `now()` |
| `updated_at` | DateTime | Auto `@updatedAt` |

### Server Actions (app/actions/help-center-actions.ts)
| Function | Purpose | Notes |
|----------|---------|-------|
| `createTicket(input)` | Create ticket | Takes `{ title, description, priority, branchId }` |
| `getTicketsByFacility(branchId)` | List tickets for a facility | Scopes by branchId AND organizationId, NOT individual user |
| `updateTicketStatus(ticketId, status)` | Update status | Admin-side; not used on hospital portal |

### Auth Pattern
- `requireTenantContext()` from `@/backend/tenant` → `{ db, session, organizationId }`
- `getSession()` from `@/app/lib/session` → SessionData: `id, username, role, name, organization_id`
- Session does NOT contain `branch_id`; branches loaded via `listBranches()` from branch-actions

### UI Components (app/components/ui/)
Badge, Button, Card, CardHeader, CardTitle, CardDescription, EmptyState, Input, Textarea,
LoadingState, Modal, Select, Table, TableHeader, TableBody, TableRow, TableCell, Skeleton

### Routing Convention
- Flat folders under `app/` (e.g., `app/reception/`, `app/admin/support/`)
- Help center lives at `app/help-center/`

---

## Scope Mapping

| Spec Item | Status | Notes |
|-----------|--------|-------|
| Investigation (schema, actions, UI, auth, routing) | ✅ Done | All verified against live files |
| Create branch `feat/hospital-ui` | ✅ Done | Created off main with help-center-db-core merged in |
| Help center layout (`app/help-center/layout.tsx`) | ✅ Done | Auth guard, metadata |
| Help center index redirect (`app/help-center/page.tsx`) | ✅ Done | Redirects to /help-center/track |
| Help center loading (`app/help-center/loading.tsx`) | ✅ Done | Uses existing LoadingState component |
| Raise Ticket form (`app/help-center/_components/RaiseTicketForm.tsx`) | ✅ Done | Form, validation, success/error states |
| Raise Ticket page (`app/help-center/raise/page.tsx`) | ✅ Done | Renders RaiseTicketForm |
| Ticket Table (`app/help-center/_components/TicketTable.tsx`) | ✅ Done | Table with loading/error/empty states, user filtering |
| Track Status page (`app/help-center/track/page.tsx`) | ✅ Done | Server component passes userId to TicketTable |
| TypeScript type check | 🔄 In progress | Running `tsc --noEmit` |
| Git commits | 🔲 Not started | — |
| Final summary | 🔲 Not started | — |

---

## Files Created / Modified

| File | What it does |
|------|-------------|
| `HELP_CENTER_PROGRESS.md` | This progress file |
| `app/help-center/layout.tsx` | Auth-guarded layout, metadata, force-dynamic |
| `app/help-center/page.tsx` | Index redirect → /help-center/track |
| `app/help-center/loading.tsx` | Loading skeleton while server renders |
| `app/help-center/raise/page.tsx` | Raise ticket page wrapper |
| `app/help-center/track/page.tsx` | Track status page, reads session for userId |
| `app/help-center/_components/RaiseTicketForm.tsx` | Client form: title, description, priority, branch, validation, success state with ticket ID |
| `app/help-center/_components/TicketTable.tsx` | Client table: loads tickets by facility, filters to current user, empty/error/loading states |

---

## Next Step

1. Wait for TypeScript check to complete; fix any type errors.
2. Make git commits in logical chunks.
3. Write the final summary (schema fields used, server actions called, assumptions).

---

## Assumptions & Decisions

1. **No `module` or `type` field**: Schema only has `title` + `description` + `priority`. Spec mentioned Module and Type but teammate didn't add them. Form built with only existing fields. **Flagged for team verification.**

2. **`getTicketsByFacility` scopes by branch, not user**: Spec says "only the current user's own tickets" but the server action fetches ALL tickets for a branch. We filter client-side by `user_id === session.id`. **Flagged — ideally server-side filtering.**

3. **No `module` column in track table**: Spec wanted a "Module" column. Schema has no module field, so omitted. **Flagged.**

4. **Branch/Facility selection**: Session doesn't contain `branch_id`. Using `listBranches()` to load branches. Auto-selects if only one branch. Both raise and track pages have branch selectors.

5. **Routing at `app/help-center/`** not `app/(hospital)/help-center/`: Codebase uses flat folders.

6. **Status enum**: Open, InProgress (DB: `in_progress`), Resolved. No "Closed" status exists despite spec mentioning it.

7. **Ticket ID display**: Schema uses UUIDs. Showing first 8 chars uppercased as a short reference ID (e.g., `A1B2C3D4`).
