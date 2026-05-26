-- ====================================================================
-- Axten IPD Price List — 34 packages + 7 daily charges
-- ====================================================================
-- INSTRUCTIONS:
-- 1. Replace :ORG_ID below with the target organization UUID.
--    (Find it: SELECT id, name FROM organizations;)
-- 2. Run in your DB console (Supabase SQL editor / pgAdmin / psql).
-- 3. Idempotent — safe to re-run.
-- ====================================================================

BEGIN;

-- ===== Set the target organization here =====
-- Replace 'PUT-ORG-UUID-HERE' with the actual UUID, then run.
DO $$
DECLARE
    org_id TEXT := 'PUT-ORG-UUID-HERE';
BEGIN

-- ===== 34 IPD packages =====
    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('ENT-001', 'Tonsillectomy / Adenoidectomy', '{"category":"E.N.T.","is_day_care":false,"sno":1}', 40000, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('ENT-002', 'Tympanoplasty', '{"category":"E.N.T.","is_day_care":false,"sno":2}', 45000, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('ENT-003', 'Cochlear Implant - Unilateral', '{"category":"E.N.T.","is_day_care":false,"sno":3}', 800000, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('GSURG-004', 'Haemorrhoidectomy / Fistulectomy', '{"category":"General & Laparoscopic Surgery","is_day_care":false,"sno":4}', 48000, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('GSURG-005', 'Appendectomy - Lap.', '{"category":"General & Laparoscopic Surgery","is_day_care":false,"sno":5}', 48000, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('GSURG-006', 'Cholecystectomy - Lap.', '{"category":"General & Laparoscopic Surgery","is_day_care":false,"sno":6}', 48000, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('GSURG-007', 'Hernioplasty - Lap. - Unilateral - Inguinal / Femoral / Umbilical / Incisional', '{"category":"General & Laparoscopic Surgery","is_day_care":false,"sno":7}', 48000, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('OBG-008', 'Normal Delivery', '{"category":"Obstetrics & Gynaecology","is_day_care":false,"sno":8}', 60000, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('OBG-009', 'Lower Segment Cesarean Section (LSCS)', '{"category":"Obstetrics & Gynaecology","is_day_care":false,"sno":9}', 80000, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('OBG-010', 'Laparoscopic Assisted Vaginal Hysterectomy (LAVH)', '{"category":"Obstetrics & Gynaecology","is_day_care":false,"sno":10}', 120000, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('OBG-011', 'Total Abdominal Hysterectomy (TAH) - Lap.', '{"category":"Obstetrics & Gynaecology","is_day_care":false,"sno":11}', 120000, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('OBG-012', 'Ovarian Cystectomy - Lap.', '{"category":"Obstetrics & Gynaecology","is_day_care":false,"sno":12}', 60000, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('OBG-013', 'Dilatation & Curettage (D&C) (Day Care)', '{"category":"Obstetrics & Gynaecology","is_day_care":true,"sno":13}', 30000, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('OBG-014', 'Cystoscopy (Day Care)', '{"category":"Obstetrics & Gynaecology","is_day_care":true,"sno":14}', 25000, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('OBG-015', 'Myomectomy - Lap.', '{"category":"Obstetrics & Gynaecology","is_day_care":false,"sno":15}', 100000, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('ORTHO-016', 'Total Knee Replacement - Unilateral - With Implant', '{"category":"Orthopaedics","is_day_care":false,"sno":16}', 200000, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('ORTHO-017', 'Hip Replacement - Unilateral', '{"category":"Orthopaedics","is_day_care":false,"sno":17}', 200000, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('ORTHO-018', 'ACL Reconstruction / Repair', '{"category":"Orthopaedics","is_day_care":false,"sno":18}', 130000, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('URO-019', 'RIRS', '{"category":"Urology & Nephrology","is_day_care":false,"sno":19}', 95000, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('URO-020', 'PCNL - Unilateral', '{"category":"Urology & Nephrology","is_day_care":false,"sno":20}', 80000, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('URO-021', 'Circumcision (Day Care)', '{"category":"Urology & Nephrology","is_day_care":true,"sno":21}', 20000, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('URO-022', 'Prostate Removal - TURP', '{"category":"Urology & Nephrology","is_day_care":false,"sno":22}', 80000, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('URO-023', 'Dialysis (All inclusive) (Day Care)', '{"category":"Urology & Nephrology","is_day_care":true,"sno":23}', 2800, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('URO-024', 'DJ Stent Removal (Day Care)', '{"category":"Urology & Nephrology","is_day_care":true,"sno":24}', 7500, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('VASC-025', 'Varicose Veins - Unilateral', '{"category":"Vascular Surgery","is_day_care":false,"sno":25}', 70000, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('VASC-026', 'AV Fistula (Day Care)', '{"category":"Vascular Surgery","is_day_care":true,"sno":26}', 35000, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('COSM-027', 'Bariatric Surgery', '{"category":"Cosmetic / Plastic Surgery","is_day_care":false,"sno":27}', 280000, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('COSM-028', 'Liposuction - Per Body Area', '{"category":"Cosmetic / Plastic Surgery","is_day_care":false,"sno":28}', 135000, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('COSM-029', 'Breast Implant - Bilateral with Implant', '{"category":"Cosmetic / Plastic Surgery","is_day_care":false,"sno":29}', 140000, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('COSM-030', 'Lipoma Removal - Per Lipoma', '{"category":"Cosmetic / Plastic Surgery","is_day_care":false,"sno":30}', 5500, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('COSM-031', 'Gynaecomastia', '{"category":"Cosmetic / Plastic Surgery","is_day_care":false,"sno":31}', 45000, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('ONCO-032', 'Chemotherapy - Per Chemo (Medicine Extra on Actuals) (Day Care)', '{"category":"Oncology","is_day_care":true,"sno":32}', 18000, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('ONCO-033', 'Breast Cancer Surgery - Unilateral', '{"category":"Oncology","is_day_care":false,"sno":33}', 180000, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

    INSERT INTO ipd_packages (package_code, package_name, description, total_amount, validity_days, inclusions, exclusions, is_active, "organizationId", created_at, updated_at)
    VALUES ('ONCO-034', 'Commando Surgery with Reconstruction - Including ICU Stay', '{"category":"Oncology","is_day_care":false,"sno":34}', 410000, 7, '["Room Rent (Day of Surgery)","Nursing Care","RMO Charges","File Charges","Surgeon Fees","Medicines & Consumables","Operation Theatre"]'::jsonb, '["Implants (charged as per actuals + patient choice)","Pre-Surgery Test / Doctor Consultation","Lab Tests","Post Discharge Medicines","Post Discharge Consultations","Extended stay → General Admission Per Day charged extra (includes Room Rent, RMO, Nursing Care, Medicines, 1 Consultant/Surgeon Visit)","Ultrasound, CT Scan, MRI Scan, Doppler, Sleep Study, or any outsourced service → charged extra + payment in advance"]'::jsonb, true, org_id, NOW(), NOW())
    ON CONFLICT (package_code, "organizationId") DO UPDATE
      SET package_name = EXCLUDED.package_name, description = EXCLUDED.description, total_amount = EXCLUDED.total_amount,
          inclusions = EXCLUDED.inclusions, exclusions = EXCLUDED.exclusions, is_active = true, updated_at = NOW();

-- ===== 7 daily / consultation charges =====
    INSERT INTO ipd_service_master (service_code, service_name, service_category, default_rate, tax_rate, is_active, "organizationId", created_at, updated_at)
    VALUES ('ADM-GEN', 'General Admission - Per Day', 'Room Charges', 8000, 0, true, org_id, NOW(), NOW())
    ON CONFLICT (service_code, "organizationId") DO UPDATE
      SET service_name = EXCLUDED.service_name, service_category = EXCLUDED.service_category,
          default_rate = EXCLUDED.default_rate, is_active = true, updated_at = NOW();

    INSERT INTO ipd_service_master (service_code, service_name, service_category, default_rate, tax_rate, is_active, "organizationId", created_at, updated_at)
    VALUES ('ADM-ICU', 'ICU Admission - Per Day', 'Room Charges', 20000, 0, true, org_id, NOW(), NOW())
    ON CONFLICT (service_code, "organizationId") DO UPDATE
      SET service_name = EXCLUDED.service_name, service_category = EXCLUDED.service_category,
          default_rate = EXCLUDED.default_rate, is_active = true, updated_at = NOW();

    INSERT INTO ipd_service_master (service_code, service_name, service_category, default_rate, tax_rate, is_active, "organizationId", created_at, updated_at)
    VALUES ('ADM-NICU', 'Nursery / NICU Admission - Per Day', 'Room Charges', 15000, 0, true, org_id, NOW(), NOW())
    ON CONFLICT (service_code, "organizationId") DO UPDATE
      SET service_name = EXCLUDED.service_name, service_category = EXCLUDED.service_category,
          default_rate = EXCLUDED.default_rate, is_active = true, updated_at = NOW();

    INSERT INTO ipd_service_master (service_code, service_name, service_category, default_rate, tax_rate, is_active, "organizationId", created_at, updated_at)
    VALUES ('CONS-BASIC', 'Doctor Consultation - Basic', 'Consultation', 500, 0, true, org_id, NOW(), NOW())
    ON CONFLICT (service_code, "organizationId") DO UPDATE
      SET service_name = EXCLUDED.service_name, service_category = EXCLUDED.service_category,
          default_rate = EXCLUDED.default_rate, is_active = true, updated_at = NOW();

    INSERT INTO ipd_service_master (service_code, service_name, service_category, default_rate, tax_rate, is_active, "organizationId", created_at, updated_at)
    VALUES ('CONS-SPEC', 'Doctor Consultation - Specialist', 'Consultation', 1000, 0, true, org_id, NOW(), NOW())
    ON CONFLICT (service_code, "organizationId") DO UPDATE
      SET service_name = EXCLUDED.service_name, service_category = EXCLUDED.service_category,
          default_rate = EXCLUDED.default_rate, is_active = true, updated_at = NOW();

    INSERT INTO ipd_service_master (service_code, service_name, service_category, default_rate, tax_rate, is_active, "organizationId", created_at, updated_at)
    VALUES ('CONS-SUPER', 'Doctor Consultation - Super Specialist', 'Consultation', 1500, 0, true, org_id, NOW(), NOW())
    ON CONFLICT (service_code, "organizationId") DO UPDATE
      SET service_name = EXCLUDED.service_name, service_category = EXCLUDED.service_category,
          default_rate = EXCLUDED.default_rate, is_active = true, updated_at = NOW();

    INSERT INTO ipd_service_master (service_code, service_name, service_category, default_rate, tax_rate, is_active, "organizationId", created_at, updated_at)
    VALUES ('MON-BP', 'BP Monitoring', 'Monitoring', 150, 0, true, org_id, NOW(), NOW())
    ON CONFLICT (service_code, "organizationId") DO UPDATE
      SET service_name = EXCLUDED.service_name, service_category = EXCLUDED.service_category,
          default_rate = EXCLUDED.default_rate, is_active = true, updated_at = NOW();

END $$;

COMMIT;

-- Verify: SELECT COUNT(*) FROM ipd_packages WHERE "organizationId" = '<ORG_ID>';
-- Expect: 34 (assuming org had none before)