#!/usr/bin/env bash
#
# Install HospitalOS scheduled jobs on the production server.
#
#   bash aws/cron/install-cron.sh            # install / update
#   bash aws/cron/install-cron.sh --dry-run  # show what would be installed
#   bash aws/cron/install-cron.sh --verify   # call each endpoint once, report status
#
# Safe to re-run: it replaces only the HospitalOS block in the user's crontab
# and leaves any other entries untouched.

set -euo pipefail

APP_DIR="${APP_DIR:-/home/ubuntu/hospitalos}"
TEMPLATE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/hospitalos-crontab"
MARK_BEGIN="# >>> hospitalos cron >>>"
MARK_END="# <<< hospitalos cron <<<"
MODE="${1:-install}"

[[ -f "$TEMPLATE" ]] || { echo "Template not found: $TEMPLATE" >&2; exit 1; }

# CRON_SECRET must match the app's, or every call is rejected with 401.
if [[ -z "${CRON_SECRET:-}" ]]; then
  if [[ -f "$APP_DIR/.env" ]]; then
    CRON_SECRET="$(grep -E '^CRON_SECRET=' "$APP_DIR/.env" | head -1 | cut -d= -f2- | tr -d '"'"'"'' | tr -d '\r')"
  fi
fi
if [[ -z "${CRON_SECRET:-}" ]]; then
  echo "CRON_SECRET not found in $APP_DIR/.env and not set in the environment." >&2
  echo "Without it every scheduled call returns 401." >&2
  exit 1
fi

APP_URL="${APP_URL:-http://localhost:3000}"

render() {
  sed -e "s|__CRON_SECRET__|${CRON_SECRET}|g" \
      -e "s|^APP_URL=.*|APP_URL=${APP_URL}|" \
      -e "s|^LOG=.*|LOG=${APP_DIR}/logs/cron.log|" "$TEMPLATE"
}

# --verify: prove each endpoint answers before trusting a schedule to it.
if [[ "$MODE" == "--verify" ]]; then
  echo "Checking endpoints on ${APP_URL} ..."
  fail=0
  # Scheduled endpoints, with their route prefix — the inpatient jobs live under
  # /api/ipd/, which is why an earlier sweep of "the cron routes" missed them.
  for entry in cron/email-dispatch cron/broadcast-dispatch cron/sla-check \
               cron/assessment-alerts cron/mis-scheduled-delivery \
               cron/appointment-reminders cron/budget-alerts \
               cron/mis-rollup cron/mis-cleanup cron/asset-maintenance-reminders \
               ipd/bed-cleaning-sla ipd/deposit-alerts ipd/interim-billing ipd/mar-topup ipd/escalation-timeout; do
    code="$(curl -s -o /dev/null -w '%{http_code}' -m 60 \
            -H "Authorization: Bearer ${CRON_SECRET}" "${APP_URL}/api/${entry}" || echo 000)"
    if [[ "$code" == "200" ]]; then
      printf '  OK   %-32s %s\n' "$entry" "$code"
    else
      printf '  FAIL %-32s %s\n' "$entry" "$code"; fail=1
    fi
  done
  [[ $fail -eq 0 ]] && echo "All endpoints healthy." || echo "Some endpoints failed — fix before scheduling." >&2
  exit $fail
fi

if [[ "$MODE" == "--dry-run" ]]; then
  # Mask the token everywhere it appears — both the CRON_SECRET= assignment and
  # each Authorization header — so a dry-run can be pasted into a ticket or
  # scrollback without leaking the secret. Masking only the header would still
  # print it in full on the assignment line.
  # The `Bearer` match is deliberately non-greedy: a greedy one would swallow
  # the URL and hide which endpoint each entry calls.
  echo "$MARK_BEGIN"
  render | sed -e 's|^CRON_SECRET=.*|CRON_SECRET=****|' -e 's|Bearer [^"]*|Bearer ****|'
  echo "$MARK_END"
  exit 0
fi

mkdir -p "$APP_DIR/logs"

# Keep any non-HospitalOS crontab entries the server already has.
existing="$(crontab -l 2>/dev/null | sed "/^${MARK_BEGIN}$/,/^${MARK_END}$/d" || true)"

{
  [[ -n "$existing" ]] && printf '%s\n' "$existing"
  echo "$MARK_BEGIN"
  render
  echo "$MARK_END"
} | crontab -

echo "Installed. Current HospitalOS schedule:"
crontab -l | sed -n "/^${MARK_BEGIN}$/,/^${MARK_END}$/p" | grep -E '^\*|^[0-9]' | sed 's|Bearer [^"]*|Bearer ****|' || true
echo
echo "Logs: $APP_DIR/logs/cron.log"
echo "Verify endpoints now with: bash aws/cron/install-cron.sh --verify"
