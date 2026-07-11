# IPD Dashboard Date Filter

## Problem

The IPD Patients tab on `/reception/dashboard` (`app/reception/dashboard/page.tsx`) has status tabs, a search box, per-column inline filters (Admission ID, Patient Name, UHID, Doctor, Ward/Bed, Status), and a balance sort — but no way to narrow the list by date. Staff can't quickly pull up "who was admitted this week" without scrolling/searching the full list.

## Goal

Add a From/To date range filter to the IPD Patients tab, filtering by each admission's `admission_date`.

## Non-goals

- No separate discharge-date filter — `admission_date` is the field already used for sorting and the "Days" column, so it's the one users expect a date filter to mean.
- No backend/server action changes — `getIPDAdmissions` already fetches all matching admissions (up to 1000) and `admission_date` is already present on every row via the existing `...a` spread in `app/actions/ipd-actions.ts`. Filtering happens entirely client-side, consistent with the existing search/column-filter/sort logic.

## Design

**State:** two new `useState<string>` fields, `ipdDateFrom` and `ipdDateTo` (both `''` by default), holding `YYYY-MM-DD` strings from native `<input type="date">` elements — same convention as `DateField`/date inputs elsewhere in the app.

**Filter logic:** extend the existing `ipdFiltered` filter predicate in `app/reception/dashboard/page.tsx` (around line 450) with a date-range check on `a.admission_date`:
- If `ipdDateFrom` is set, exclude rows where the admission date (compared at the day level) is before it.
- If `ipdDateTo` is set, exclude rows where the admission date is after it.
- Both bounds inclusive; empty string means no bound on that side.

**UI:** two small date inputs ("From" / "To") placed in the existing filter bar (`app/reception/dashboard/page.tsx` ~line 1013), between the search box and the "Clear filters" button, matching the existing filter bar's sizing/styling (`text-xs`, `rounded-xl`, `border-gray-200`).

**Clear filters:** the existing `activeColFilterCount`/"Clear N filters" button currently only counts `ipdColFilters`. Extend its count and its `clearAllColFilters` handler to also account for and reset `ipdDateFrom`/`ipdDateTo`, so one button clears everything (column filters + date range).

**Export:** `handleExportIpd` already exports `ipdFiltered` (the filtered array), so the date range is automatically respected in the Excel export with no separate change needed.

## Testing

No automated test framework in this repo. Verification: `npm run typecheck`, and manual check in the browser — set a From/To range, confirm only admissions within that window show, confirm Export produces the filtered set, confirm "Clear filters" resets the date range along with column filters.
