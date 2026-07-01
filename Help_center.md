ROLE
You are building the Hospital Portal client-facing UI for the HIMS Help Center 
module inside the existing HospitalOS codebase (Next.js + Prisma + PostgreSQL). 
This is a 24-hour sprint MVP. Two other engineers are using their own AI agents 
in parallel on adjacent code (Dev Admin portal, core auth/architecture) — you 
must stay strictly inside your boundary and never touch their files.

MANDATORY: INVESTIGATE BEFORE WRITING ANY CODE
Do not write a single line of UI or logic until you have actually read the 
following from this repository. Do not assume, infer from memory, or guess 
field names, conventions, or library choices — verify everything against the 
real files.

1. Read prisma/schema.prisma in full. This was just pushed by a teammate on 
   branch feat/help-center-db-core. Identify the exact models, field names, 
   enums, and relations relevant to tickets (likely something like Ticket, 
   plus any related models for status, priority, type, and the relation to 
   User/Facility). Do not assume field names like "status" or "priority" exist 
   as written anywhere else — use exactly what's in the schema.

2. Read the Server Actions file referenced as help-center-actions.ts (locate 
   it — path may not be exactly that, search the repo). This defines the 
   mutation/query functions you must call from the UI. Do not write your own 
   server actions or duplicate this logic — only call what's exported here. 
   If a server action you need doesn't exist yet, stop and report this rather 
   than inventing one or duplicating Vishnu's work.

3. Read package.json to determine the actual UI dependencies installed 
   (e.g. is shadcn/ui present, is it pure Tailwind, is there a component 
   library already in use). Then read the components/ or app/components/ 
   directory (search for the actual path) to see existing component patterns, 
   naming conventions, and styling approach already used elsewhere in 
   HospitalOS. Your new UI must visually and structurally match what already 
   exists — same component library, same Tailwind config/theme tokens, same 
   file/folder conventions. Do not introduce a new component library or 
   styling approach even if you think another one is nicer.

4. Check how authentication/session is currently read in existing pages or 
   server actions elsewhere in the app (e.g. how the logged-in user and their 
   facility are accessed). Use that exact pattern to get the current user's 
   identity and facility for the ticket form — do not invent your own auth 
   check or assume a particular session shape.

5. Check the existing routing structure under app/ to confirm the route group 
   convention (e.g. how other route groups like app/(something)/ are 
   structured) before creating app/(hospital)/help-center/.

If any of the above is ambiguous, missing, or you cannot find a referenced 
file, STOP and report exactly what's missing rather than guessing or 
fabricating a substitute. A wrong assumption here breaks the build for the 
whole team in a 24-hour window.

SCOPE — STRICT BOUNDARIES
✅ You own ONLY: app/(hospital)/help-center/... and any components used 
   exclusively within it (e.g. app/(hospital)/help-center/_components/).
❌ Do NOT modify, create, or touch:
   - prisma/schema.prisma (Vishnu owns this — read-only for you)
   - Any file under app/(admin)/... (Akshay's portal)
   - Any auth/middleware/routing files outside your route group
   - help-center-actions.ts itself — only import and call from it, 
     never edit it
If you believe a server action is missing or incorrect, report it in your 
output — do not patch around it by writing inline logic that bypasses it.

MVP SCOPE FOR THIS SPRINT (cut deliberately to hit 24 hours)
Build a pure text-based MVP. Explicitly OUT of scope today — do not build any 
of this even if it seems easy to add:
- File/attachment uploads
- WebSockets or any real-time updates
- Background cron jobs or scheduled logic
- Email/SMS notifications
- Any admin-side functionality

IN scope — two screens within app/(hospital)/help-center/:

1. RAISE TICKET (e.g. app/(hospital)/help-center/raise/page.tsx or as 
   appropriate to existing routing conventions)
   - A form matching exactly the fields present in the actual Ticket model 
     you read from schema.prisma. Likely candidates based on the original 
     spec (verify against the real schema, do not assume these exist 
     as-is): Module, Priority, Type, Summary, Detailed Description.
   - Facility and the submitting user must be derived from the current 
     session/auth context (per investigation step 4) — never a free-text 
     field, never user-selectable.
   - Client-side validation for required fields before calling the server 
     action.
   - Clear loading state during submission (server action call) and a 
     success state showing the generated ticket ID/number, using whatever 
     the schema actually calls that field.
   - Clear, human-readable error states if the server action call fails — 
     do not let a thrown error reach the user as a raw stack trace or 
     unstyled text.

2. TRACK STATUS (e.g. app/(hospital)/help-center/track/page.tsx)
   - A data table listing only the current user's own tickets (call the 
     correct read/query server action — confirm whether it already scopes 
     to the current user server-side; if not, flag this rather than 
     filtering insecurely on the client).
   - Columns: Ticket Number, Module, Summary, Status, Date Created — match 
     exact field names from the schema, not the names from this prompt.
   - Status should be visually distinct per state (e.g. color-coded badges 
     for Open / In Progress / Resolved / Closed) using whatever badge/chip 
     pattern already exists in the codebase, or a new one consistent with 
     existing design tokens if none exists.
   - Empty state for a user with zero tickets (do not just render a blank 
     table).
   - Loading state while the data fetches.
   - This is read-only today — no status filters, no date-range filters, 
     no rating UI. Those are explicitly post-MVP.

DESIGN DIRECTION
This is a hospital staff-facing tool used under time pressure — clarity and 
speed of comprehension matter more than visual flourish, but it should still 
look like a deliberately designed product, not a default-styled scaffold.

- Match HospitalOS's existing visual language exactly (colors, spacing, 
  typography, component shapes) as discovered in step 3 — do not introduce 
  a new palette or component style.
- Within those constraints, use good design judgment: clear visual hierarchy 
  between the form/table and the page chrome, generous touch targets and 
  spacing (hospital staff may be using this on shared/mobile devices), 
  status badges that are scannable at a glance, and a layout that doesn't 
  feel like an unstyled form dump.
- Avoid generic "AI-generated" tells: no unnecessary gradients, no overused 
  card-with-shadow-on-everything pattern unless that's already the existing 
  HospitalOS convention, no placeholder lorem ipsum left in committed code.
- Responsive: must work on a reasonably narrow viewport, not just desktop.

GIT / WORKFLOW DISCIPLINE
- Work only on branch feat/hospital-ui (already checked out off 
  feat/help-center-db-core per team instructions).
- Do not rebase, merge, or push to any other branch.
- Do not modify any file outside your scope listed above, even if you 
  notice something you think is a bug elsewhere — report it instead of 
  fixing it, since another AI/engineer owns that file right now and a 
  silent edit will cause a merge conflict or overwrite their work.
- Commit in small, logical chunks (e.g. "raise ticket form," "track status 
  table") rather than one giant commit, so the team can review quickly 
  given the time pressure.

BEFORE YOU FINISH
Summarize:
1. The exact schema fields/enums you used (so the team can sanity-check 
   against what Vishnu actually built).
2. Which server actions you called, and confirm none were missing.
3. Any assumption you were forced to make because something was ambiguous 
   or undiscoverable in the codebase, flagged explicitly so I can verify it 
   before merging.