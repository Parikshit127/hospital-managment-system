# Avani Enterprise Hospital OS

A comprehensive Hospital Management System built with Next.js 15, TailwindCSS, and Supabase.

## Features

- **Reception**: Patient Registration & Digital ID Generation.
- **Doctor**: Clinical Dashboard, EHR, Lab Ordering, Pharmacy Prescriptions.
- **Lab**: Technician Dashboard, Test Result Entry, Status Tracking.
- **Pharmacy**: Billing, Inventory Management, "Mark as Paid" Workflow.
- **Discharge**: Discharge Summary Generation.

## Prerequisites

- Node.js 18+
- npm or yarn

## Setup Instructions

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/sahil-067/hospital-os.git
    cd hospital-os
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Environment Variables:**
    Create a `.env` file in the root directory. You need the following keys (ask the project lead for values):
    ```env
    DATABASE_URL="postgresql://..."
    DIRECT_URL="postgresql://..."
    NEXT_PUBLIC_SUPABASE_URL="https://..."
    NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."
    JWT_SECRET="..."
    APP_BASE_URL="https://your-domain.com"
    INTERNAL_VERIFY_TOKEN="..."
    ```

4.  **Database Setup:**
    ```bash
    # Generate Prisma Client
    npx prisma generate

    # Push Schema to DB (if setting up fresh)
    npx prisma db push

    # Seed Initial Data (Admin, Doctor, etc.)
    npx prisma db seed
    ```

## Running the Application (Demo Mode)

To start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

> ℹ️  `npm run dev` automatically runs `prisma generate` and a dependency-sync
> check before starting the server. If a teammate has bumped a dependency
> version, you'll see a clear warning telling you to run `npm run setup`.

## 🔄 After `git pull` — read this!

When someone on the team bumps a package version (e.g. Prisma 5 → 6) and pushes
the new `package.json` / `package-lock.json`, your local `node_modules/` will be
out of date. Symptoms:

- Routes start returning **404** in the dev server (especially `/admin/...`)
- Cryptic Prisma errors like `Unknown arg` or `Object literal may only specify known properties`
- TypeScript errors that didn't exist before pulling

**One-command fix after any pull:**

```bash
npm run setup
```

That runs `npm install`, regenerates the Prisma client, and clears the Turbopack
cache. You only need to run it when `package.json` or `prisma/schema.prisma`
changed — but it's safe to run anytime.

For a nuclear reset (uninstall + reinstall + clean cache + restart):

```bash
npm run dev:fresh
```

## Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server (auto-runs predev → prisma generate + dep check) |
| `npm run setup` | After-pull recovery: `npm install` + `prisma generate` + clean `.next` |
| `npm run dev:fresh` | Full reset then restart dev — when nothing else works |
| `npm run clean` | Remove the `.next` Turbopack cache only |
| `npm run check:deps` | Manually check for package-version drift |
| `npm run typecheck` | Run `tsc --noEmit` on the whole project |
| `npm run lint` | Run ESLint |
| `npm run db:migrate:dev` | Apply Prisma migrations locally |
| `npm run db:migrate:prod` | Apply Prisma migrations to production |
| `npm run db:backup` | `pg_dump` a backup to `backups/` |

## Production Build

To build and start for production:

```bash
npm run build
npm start
```
