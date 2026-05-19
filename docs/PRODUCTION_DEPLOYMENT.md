# HospitalOS Production Deployment

## Production Database

Use managed PostgreSQL with two URLs:

- `DATABASE_URL`: pooled connection for the running app.
- `DIRECT_URL`: direct PostgreSQL connection for Prisma migrations.

Do not run `prisma db push --accept-data-loss` in production. Apply schema changes with:

```bash
npm run db:status
npm run db:migrate:prod
```

Create a database backup before each release:

```bash
npm run db:backup
```

Store backups outside the app server after creation.

## Deployment Order

1. Create the production database and set `DATABASE_URL` and `DIRECT_URL`.
2. Set required app secrets: `JWT_SECRET`, `CONFIG_ENCRYPTION_KEY`, `APP_BASE_URL`, `NEXT_PUBLIC_APP_URL`.
3. Run `npm ci`.
4. Run `npm run check:prisma` and `npm run typecheck`.
5. Run `npm run db:migrate:prod`.
6. Deploy the app with `npm run build` and `npm run start`, or deploy through Vercel.

Vercel builds now run `prisma generate && next build`; migrations are a release step, not a build side effect.

## Admin-Managed Integrations

Administrators can maintain service credentials from `Admin > Integrations`.

The admin panel stores newly saved secrets encrypted with `CONFIG_ENCRYPTION_KEY` or `JWT_SECRET`, redacts them before returning data to the browser, and records updates/tests in `system_audit_logs`.

Current runtime behavior:

- Razorpay: invoice and appointment payments use organization-level credentials when enabled, with environment variables as fallback.
- OpenAI triage: uses organization-level API key when enabled, with `OPENAI_API_KEY` as fallback.
- WhatsApp: supports organization-level credentials when the caller supplies `organizationId`; otherwise falls back to `AISENSY_API_KEY`.
- SMTP: admin page can store and verify credentials; existing email helpers still fall back to global SMTP unless a caller passes organization config.

## Required Environment

Minimum production keys:

```bash
DATABASE_URL=
DIRECT_URL=
JWT_SECRET=
CONFIG_ENCRYPTION_KEY=
APP_BASE_URL=
NEXT_PUBLIC_APP_URL=
CRON_SECRET=
```

Set optional integration fallbacks only if you want global defaults:

```bash
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
NEXT_PUBLIC_RAZORPAY_KEY_ID=
SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=
SMTP_USER=
SMTP_PASS=
OPENAI_API_KEY=
COMBIRDS_BASE_URL=
AISENSY_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```
