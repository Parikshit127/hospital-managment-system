#!/usr/bin/env bash
#
# Move pharmacy bills into IPD.
# Changes invoices.invoice_type from 'Pharmacy' to 'IPD' for bills created
# before a cutoff date. The patient linkage (patient_id) is left untouched,
# so each bill stays under the same patient and simply shows as "IPD".
#
# SAFETY: takes a full DB backup, prints a dry-run count, asks for explicit
# confirmation, then runs the UPDATE inside a transaction.
#
# Run from the project root on the server (e.g. ~/hospitalos):
#   bash scripts/move-pharmacy-bills-to-ipd.sh
#
# Optional overrides (env vars):
#   CUTOFF="2026-06-12 00:00:00+05:30"   # IST; bills strictly BEFORE this move
#   ORG_ID="org-avani-default"           # limit to one org (blank = all orgs)
#   DB_URL="postgresql://..."            # else read DIRECT_URL/DATABASE_URL from .env
#
set -euo pipefail

CUTOFF="${CUTOFF:-2026-06-12 00:00:00+05:30}"
ORG_ID="${ORG_ID:-}"

# ── Resolve DB URL ────────────────────────────────────────────────────────────
DB_URL="${DB_URL:-}"
if [ -z "$DB_URL" ] && [ -f .env ]; then
  DB_URL="$(grep -E '^DIRECT_URL=' .env | head -1 | sed -E 's/^DIRECT_URL=//; s/^["'\'']//; s/["'\'']$//')"
  if [ -z "$DB_URL" ]; then
    DB_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | sed -E 's/^DATABASE_URL=//; s/^["'\'']//; s/["'\'']$//')"
  fi
fi
if [ -z "$DB_URL" ]; then
  echo "ERROR: DB URL not found. Pass DB_URL=... or run from a folder whose .env has DIRECT_URL/DATABASE_URL." >&2
  exit 1
fi

# ── Optional single-org filter ────────────────────────────────────────────────
ORG_FILTER=""
if [ -n "$ORG_ID" ]; then
  ORG_FILTER="AND \"organizationId\" = '$ORG_ID'"
fi

SAFE_URL="$(printf '%s' "$DB_URL" | sed -E 's,//[^@]+@,//***:***@,')"
echo "==> DB     : $SAFE_URL"
echo "==> Cutoff : $CUTOFF (IST)   Org: ${ORG_ID:-ALL}"
echo

# ── 1. Backup ────────────────────────────────────────────────────────────────
TS="$(date +%Y%m%d-%H%M%S)"
BACKUP="$HOME/backup-before-ipd-move-$TS.dump"
echo "==> Backup -> $BACKUP"
pg_dump "$DB_URL" --format=custom --no-owner --no-acl -f "$BACKUP"
echo "    Backup OK."
echo

# ── 2. Dry run ───────────────────────────────────────────────────────────────
echo "==> Dry run — bills that WILL move (nothing changed yet):"
psql "$DB_URL" -v ON_ERROR_STOP=1 -c "
  SELECT \"organizationId\" AS org, COUNT(*) AS bills,
         MIN(created_at) AS earliest, MAX(created_at) AS latest
  FROM invoices
  WHERE invoice_type = 'Pharmacy'
    AND created_at < '$CUTOFF' $ORG_FILTER
  GROUP BY \"organizationId\";
"
echo

# ── 3. Confirm ───────────────────────────────────────────────────────────────
read -r -p "Proceed with UPDATE (Pharmacy -> IPD)? type 'yes' to continue: " ANS
if [ "$ANS" != "yes" ]; then
  echo "Aborted. No changes made. Backup kept at: $BACKUP"
  exit 0
fi

# ── 4. Update inside a transaction ───────────────────────────────────────────
echo "==> Updating..."
psql "$DB_URL" -v ON_ERROR_STOP=1 <<SQL
BEGIN;
UPDATE invoices
SET invoice_type = 'IPD'
WHERE invoice_type = 'Pharmacy'
  AND created_at < '$CUTOFF' $ORG_FILTER;
COMMIT;
SQL

echo
echo "==> Done. Those pharmacy bills now show as IPD."
echo "    Backup: $BACKUP"
echo "    To undo: pg_restore --clean --no-owner --no-acl -d \"$DB_URL\" \"$BACKUP\""
