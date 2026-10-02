#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# HospitalOS — Database Backup Script (Azure variant)
# Dumps PostgreSQL to local file + uploads to Azure Blob Storage
# Add to crontab (as the app user): 0 3 * * * $HOME/hospitalos/azure/backup-db.sh
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# Load environment
source "$HOME/hospitalos/.env"

BACKUP_DIR="$HOME/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="hospitalos_${TIMESTAMP}.dump"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting database backup..."

# Dump database
pg_dump "$DIRECT_URL" \
    --format=custom \
    --no-owner \
    --no-acl \
    --file="$BACKUP_DIR/$FILENAME"

FILESIZE=$(du -sh "$BACKUP_DIR/$FILENAME" | cut -f1)
echo "[$(date)] Backup created: $FILENAME ($FILESIZE)"

# Upload to Azure Blob (uses same storage account as app files, "backups" container)
if command -v az &> /dev/null; then
    az storage blob upload \
        --connection-string "$AZURE_STORAGE_CONNECTION_STRING" \
        --container-name "backups" \
        --name "db/$FILENAME" \
        --file "$BACKUP_DIR/$FILENAME" \
        --output none
    echo "[$(date)] Uploaded to Azure Blob: backups/db/$FILENAME"
else
    echo "[$(date)] Azure CLI not found, skipping Blob upload"
fi

# Keep only last 7 local backups
cd "$BACKUP_DIR"
ls -t hospitalos_*.dump | tail -n +8 | xargs -r rm
echo "[$(date)] Local cleanup done (keeping last 7)"

echo "[$(date)] Backup complete!"
