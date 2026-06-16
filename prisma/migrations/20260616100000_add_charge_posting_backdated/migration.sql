-- Flag IPD charge postings that were backdated by staff
ALTER TABLE "ipd_charge_postings" ADD COLUMN IF NOT EXISTS "is_backdated" BOOLEAN NOT NULL DEFAULT false;
