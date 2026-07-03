#!/bin/bash
# AWS EC2 Cron Setup for HospitalOS
# Run once on the EC2 instance to register all cron jobs.
#
# Prerequisites:
#   export VERCEL_URL=https://your-app.vercel.app
#   export CRON_SECRET=your-cron-secret-here
#
# Then run: bash scripts/aws-cron-setup.sh

set -e

if [ -z "$VERCEL_URL" ] || [ -z "$CRON_SECRET" ]; then
    echo "ERROR: Set VERCEL_URL and CRON_SECRET before running."
    echo "  export VERCEL_URL=https://your-app.vercel.app"
    echo "  export CRON_SECRET=your-secret"
    exit 1
fi

# Write cron calls to a helper script so the crontab stays readable
RUNNER=/usr/local/bin/hospitalos-cron.sh
sudo tee "$RUNNER" > /dev/null <<SCRIPT
#!/bin/bash
# Called by crontab — first arg is the API path
curl -sf -X GET \\
  -H "Authorization: Bearer $CRON_SECRET" \\
  "$VERCEL_URL\$1" \
  >> /var/log/hospitalos-cron.log 2>&1
SCRIPT
sudo chmod +x "$RUNNER"

# Install crontab (preserves existing non-hospitalos lines)
EXISTING=$(crontab -l 2>/dev/null | grep -v "hospitalos-cron" || true)

NEW_CRONTAB="$EXISTING

# HospitalOS cron jobs — managed by scripts/aws-cron-setup.sh
# All times are UTC. IST = UTC+5:30.

# Bed cleaning SLA — midnight UTC (5:30am IST)
0 0 * * *  $RUNNER /api/ipd/bed-cleaning-sla

# MIS worker — 1am UTC (6:30am IST)
0 1 * * *  $RUNNER /api/mis/worker

# MIS scheduled delivery — 1:30am UTC (7am IST)
30 1 * * *  $RUNNER /api/cron/mis-scheduled-delivery

# MIS daily rollup — 6:30pm UTC (midnight IST)
30 18 * * *  $RUNNER /api/cron/mis-rollup

# SLA check — every 15 minutes
*/15 * * * *  $RUNNER /api/cron/sla-check

# Broadcast dispatch — every 5 minutes
*/5 * * * *  $RUNNER /api/cron/broadcast-dispatch
"

echo "$NEW_CRONTAB" | crontab -

echo "✓ Crontab installed. Current crontab:"
crontab -l

echo ""
echo "Logs will appear at: /var/log/hospitalos-cron.log"
echo "Test a job manually: $RUNNER /api/cron/sla-check"
