-- Void AVS-ADM-26-27-040 (RAJ KUMAR) and AVS-ADM-26-27-032 (ANANT GUPTA) — admitted by
-- mistake, confirmed to write off the attached charges (₹136 pharmacy on -040, ₹1900
-- labs on -032). Mirrors cancelAdmission's forceCancel cascade (app/actions/ipd-actions.ts).
--
-- Run in an interactive psql session (not piped through bash) so you can inspect the
-- SELECT output before COMMIT:
--   psql "$DIRECT_URL" -f scripts/void-mistaken-admissions.sql
-- (use DIRECT_URL, not DATABASE_URL — DATABASE_URL has pgbouncer/pool params psql can't parse)
--
-- Everything runs inside one transaction. Nothing is permanent until COMMIT at the end.

BEGIN;

-- Sanity check before touching anything
SELECT admission_id, status, bed_id, patient_id, admission_date
FROM admissions
WHERE admission_id IN ('AVS-ADM-26-27-040', 'AVS-ADM-26-27-032');

-- 1. Delete charge-posting rows (no status column, so delete like cancelAdmission does)
DELETE FROM ipd_charge_postings
WHERE admission_id IN ('AVS-ADM-26-27-040', 'AVS-ADM-26-27-032');

-- 2. Cancel pharmacy orders
UPDATE pharmacy_orders
SET status = 'Cancelled'
WHERE admission_id IN ('AVS-ADM-26-27-040', 'AVS-ADM-26-27-032');

-- 3. Cancel any admission packages
UPDATE ipd_admission_packages
SET status = 'Cancelled'
WHERE admission_id IN ('AVS-ADM-26-27-040', 'AVS-ADM-26-27-032');

-- 4. Cancel invoices tied to these admissions (idempotent — already-cancelled ones untouched)
UPDATE invoices
SET status = 'Cancelled'
WHERE admission_id IN ('AVS-ADM-26-27-040', 'AVS-ADM-26-27-032')
  AND status <> 'Cancelled';

-- 5. Free the beds (read bed_id before the admission row changes, doesn't matter here
--    since we don't null it out, but kept as its own step for clarity)
UPDATE beds
SET status = 'Available'
WHERE bed_id IN (
    SELECT bed_id FROM admissions
    WHERE admission_id IN ('AVS-ADM-26-27-040', 'AVS-ADM-26-27-032')
      AND bed_id IS NOT NULL
);

-- 6. Cancel the admissions themselves
UPDATE admissions
SET status = 'Cancelled',
    discharge_date = now(),
    discharge_type = 'Cancelled',
    cancellation_reason = 'Admitted by mistake — patient was never actually admitted (voided via repair script, charges written off)',
    cancellation_date = now(),
    cancelled_by = 'repair-script'
WHERE admission_id IN ('AVS-ADM-26-27-040', 'AVS-ADM-26-27-032')
RETURNING admission_id, status, discharge_date, bed_id;

-- 7. Audit log
INSERT INTO system_audit_logs (action, module, entity_type, entity_id, details, "organizationId", created_at)
SELECT
    'FORCE_CANCEL_ADMISSION',
    'ipd',
    'admission',
    admission_id,
    json_build_object(
        'reason', 'Admitted by mistake — patient was never actually admitted (voided via repair script, charges written off)',
        'bed_id', bed_id,
        'force', true,
        'had_charges', true
    )::text,
    "organizationId",
    now()
FROM admissions
WHERE admission_id IN ('AVS-ADM-26-27-040', 'AVS-ADM-26-27-032');

-- Review the RETURNING output above. If it looks right:
COMMIT;
-- If anything looks wrong, run ROLLBACK; instead of COMMIT above.
