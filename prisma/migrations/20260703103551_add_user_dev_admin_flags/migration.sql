-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_dev_admin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_developer" BOOLEAN NOT NULL DEFAULT false;

