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

## Production Build

To build and start for production:

```bash
npm run build
npm start
```
