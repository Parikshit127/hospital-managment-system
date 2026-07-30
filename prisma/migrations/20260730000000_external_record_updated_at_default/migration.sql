-- patient_external_records.updated_at is NOT NULL but had no default. The save
-- action inserts via raw SQL, which bypasses Prisma's @updatedAt, so the column
-- was left null and every external-record save failed with a NOT NULL violation
-- (the feature had 0 rows — it never worked). Give it a default like created_at.
ALTER TABLE "patient_external_records" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
