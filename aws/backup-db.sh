#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# HospitalOS — Database Backup Script
# Dumps PostgreSQL to local file + uploads to S3
# Add to crontab: 0 3 * * * /home/ubuntu/hospitalos/aws/backup-db.sh
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# Load environment
source /home/ubuntu/hospitalos/.env

BACKUP_DIR="/home/ubuntu/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="hospitalos_${TIMESTAMP}.dump"
S3_BUCKET="hospitalos-production-backups"

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

# Upload to S3
if command -v aws &> /dev/null; then
    aws s3 cp "$BACKUP_DIR/$FILENAME" "s3://$S3_BUCKET/db/$FILENAME"
    echo "[$(date)] Uploaded to S3: s3://$S3_BUCKET/db/$FILENAME"
else
    echo "[$(date)] AWS CLI not found, skipping S3 upload"
fi

# Keep only last 7 local backups
cd "$BACKUP_DIR"
ls -t hospitalos_*.dump | tail -n +8 | xargs -r rm
echo "[$(date)] Local cleanup done (keeping last 7)"

echo "[$(date)] Backup complete!"
