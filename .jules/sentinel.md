## 2025-02-18 - [Missing Authorization on Pill Reminders Cron Job]
**Vulnerability:** Found `app/api/cron/pill-reminders/route.ts` endpoint had its authorization checks commented out, allowing unauthorized processing of pill reminders.
**Learning:** Cron endpoints are sometimes temporarily commented out for testing, which creates missing authorization check risks.
**Prevention:** Ensure `process.env.CRON_SECRET` checks are consistently applied across all API endpoints designed for automated schedulers.
