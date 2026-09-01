#!/bin/bash
# AWS EC2 Cron Setup for HospitalOS
# Run once on the EC2 instance to register all cron jobs.
#
# Prerequisites:
#   export APP_BASE_URL=http://localhost:3000     # or https://your-domain
#   export CRON_SECRET=your-cron-secret-here
#
# Then run: bash scripts/aws-cron-setup.sh
#
# Nothing here is Vercel-specific. APP_BASE_URL is simply the address these jobs curl,
# and it matches the variable the app itself prefers (see getAppBaseUrl() in
# app/lib/password-setup.ts and backend/email.ts). When the app runs on this same box,
# http://localhost:3000 is the best choice — the request never leaves the machine.

set -e

# Resolve the base URL the same way the application does, so one value works for both.
# VERCEL_URL is still honoured for servers already configured that way, but note the app
# treats it as a BARE HOSTNAME and prefixes https:// itself — so a scheme is added here
# only when it is missing, never doubled.
APP_URL="${APP_BASE_URL:-}"
if [ -z "$APP_URL" ] && [ -n "${VERCEL_URL:-}" ]; then
    case "$VERCEL_URL" in
        http://*|https://*) APP_URL="$VERCEL_URL" ;;
        *)                  APP_URL="https://$VERCEL_URL" ;;
    esac
fi
if [ -z "$APP_URL" ]; then
    APP_URL="${NEXT_PUBLIC_APP_URL:-}"
fi
APP_URL="${APP_URL%/}"   # strip any trailing slash so paths do not become //api/...

if [ -z "$APP_URL" ] || [ -z "$CRON_SECRET" ]; then
    echo "ERROR: Set APP_BASE_URL and CRON_SECRET before running."
    echo "  export APP_BASE_URL=http://localhost:3000"
    echo "  export CRON_SECRET=your-secret"
    echo ""
    echo "Both can be read straight out of .env:"
    echo "  export \$(grep -E '^(APP_BASE_URL|NEXT_PUBLIC_APP_URL|CRON_SECRET)=' .env | sed 's/\"//g' | xargs)"
    exit 1
fi

echo "Base URL: $APP_URL"

# Write cron calls to a helper script so the crontab stays readable
RUNNER=/usr/local/bin/hospitalos-cron.sh
LOG=/var/log/hospitalos-cron.log

sudo tee "$RUNNER" > /dev/null <<SCRIPT
#!/bin/bash
# Called by crontab — first arg is the API path.
#
# Writes exactly one line per run: UTC timestamp, the path, then the response body.
#
# The line is assembled in memory and appended with a SINGLE printf. That matters:
# several jobs share the */5 slot and fire at the same instant, and separate writes from
# concurrent processes interleave inside the file — producing lines with one job's
# timestamp followed by another job's body. One write per run keeps each entry intact.
#
# "-f" makes curl print nothing at all on an HTTP error, which is how a 401 used to
# leave no trace whatsoever; the fallback records the exit code so a failing job is
# visible in the log instead of looking like it never ran.
path="\$1"
body="\$(curl -sf -X GET -H "Authorization: Bearer $CRON_SECRET" "$APP_URL\$path")" \\
    || body="{\\"error\\":\\"curl failed, exit \$?\\"}"
body="\${body//\$'\\n'/ }"
printf '%s %s %s\\n' "\$(date -u +%Y-%m-%dT%H:%M:%SZ)" "\$path" "\$body" >> $LOG 2>&1
SCRIPT
sudo chmod +x "$RUNNER"

# Create the log file up front, owned by the user whose crontab this installs into.
#
# This is not cosmetic. cron runs the runner as that user, /var/log is root-owned, and
# the runner appends with ">>". If the file does not exist the redirect fails and the
# shell aborts the line BEFORE curl runs — so every job dies silently, with no log to
# explain why, because the log is the thing that could not be written.
sudo touch "$LOG"
sudo chown "$(id -u):$(id -g)" "$LOG"

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

# Email outbox dispatch — every 2 minutes (v4 Addendum)
*/2 * * * *  $RUNNER /api/cron/email-dispatch

# Background activity generator — every 5 minutes.
# Harmless on a normal server: the route returns 404 unless SIM_ENABLED=1 is set in the
# environment, and even then it only advances organizations explicitly flagged as
# simulation environments. Start/stop is controlled per hospital from
# Superadmin -> Organizations -> Config, not by editing this crontab.
*/5 * * * *  $RUNNER /api/cron/sim-tick
"

echo "$NEW_CRONTAB" | crontab -

echo "✓ Crontab installed. Current crontab:"
crontab -l

echo ""
echo "Logs will appear at: /var/log/hospitalos-cron.log"
echo "Test a job manually: $RUNNER /api/cron/sla-check"
