#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# HospitalOS — Data Migration: AWS/Supabase prod → Azure test clone
# Copies a snapshot of the production database and S3 files into the newly
# provisioned Azure Postgres Flexible Server + Blob Storage container.
# Run this from any machine with network access to both endpoints (e.g. your
# laptop) — it does NOT need to run on the Azure VM.
#
# Prerequisites:
#   - postgresql-client (pg_dump/pg_restore) matching the source server version
#   - azcopy (https://learn.microsoft.com/azure/storage/common/storage-use-azcopy-v10)
#     azcopy can copy directly from S3 to Blob, no local download needed.
#
# Usage:
#   export SOURCE_DIRECT_URL="postgresql://...supabase prod DIRECT_URL..."
#   export TARGET_DIRECT_URL="postgresql://...azure DIRECT_URL from provision.sh..."
#   export SOURCE_AWS_ACCESS_KEY_ID="..."
#   export SOURCE_AWS_SECRET_ACCESS_KEY="..."
#   export SOURCE_S3_BUCKET="hospitalos-production-documents"
#   export TARGET_AZURE_STORAGE_ACCOUNT="..."
#   export TARGET_AZURE_STORAGE_CONTAINER="patient-records"
#   export TARGET_AZURE_SAS_TOKEN="...(see below)..."
#   ./migrate-data.sh
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

: "${SOURCE_DIRECT_URL:?Set SOURCE_DIRECT_URL to the prod Supabase DIRECT_URL}"
: "${TARGET_DIRECT_URL:?Set TARGET_DIRECT_URL to the new Azure Postgres DIRECT_URL}"

DUMP_FILE="/tmp/hospitalos-migration-$(date +%Y%m%d_%H%M%S).dump"

echo "╔══════════════════════════════════════════════════════╗"
echo "║   HospitalOS — Migrating prod data to Azure clone    ║"
echo "╚══════════════════════════════════════════════════════╝"

# ── 1. Dump prod database ───────────────────────────────────────────────────
echo ""
echo "► Step 1/3: Dumping production database..."
pg_dump "$SOURCE_DIRECT_URL" \
    --format=custom \
    --no-owner \
    --no-acl \
    --file="$DUMP_FILE"
echo "   Dump saved: $DUMP_FILE ($(du -sh "$DUMP_FILE" | cut -f1))"

# ── 2. Restore into Azure Postgres ──────────────────────────────────────────
echo ""
echo "► Step 2/3: Restoring into Azure Postgres Flexible Server..."
pg_restore \
    --dbname="$TARGET_DIRECT_URL" \
    --no-owner \
    --no-acl \
    --clean --if-exists \
    "$DUMP_FILE"
echo "   Restore complete."

# ── 3. Copy files: S3 bucket → Azure Blob container ─────────────────────────
if [ -n "${SOURCE_S3_BUCKET:-}" ] && [ -n "${TARGET_AZURE_STORAGE_ACCOUNT:-}" ]; then
    echo ""
    echo "► Step 3/3: Copying files from S3 to Azure Blob..."
    if ! command -v azcopy &> /dev/null; then
        echo "   azcopy not found. Install it first: https://aka.ms/downloadazcopy"
        exit 1
    fi

    export AWS_ACCESS_KEY_ID="${SOURCE_AWS_ACCESS_KEY_ID:?Set SOURCE_AWS_ACCESS_KEY_ID}"
    export AWS_SECRET_ACCESS_KEY="${SOURCE_AWS_SECRET_ACCESS_KEY:?Set SOURCE_AWS_SECRET_ACCESS_KEY}"
    : "${TARGET_AZURE_SAS_TOKEN:?Set TARGET_AZURE_SAS_TOKEN (a write+list SAS for the target container)}"

    azcopy copy \
        "https://s3.amazonaws.com/${SOURCE_S3_BUCKET}/*" \
        "https://${TARGET_AZURE_STORAGE_ACCOUNT}.blob.core.windows.net/${TARGET_AZURE_STORAGE_CONTAINER}${TARGET_AZURE_SAS_TOKEN}" \
        --recursive
    echo "   File copy complete."
else
    echo ""
    echo "► Step 3/3: Skipped (SOURCE_S3_BUCKET / TARGET_AZURE_STORAGE_ACCOUNT not set)."
fi

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║              Migration Complete!                     ║"
echo "║  Local dump kept at: $DUMP_FILE"
echo "╚══════════════════════════════════════════════════════╝"
