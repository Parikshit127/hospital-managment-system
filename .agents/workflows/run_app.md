---
description: Setup and run the Hospital Management System
---

1. Install dependencies
// turbo
npm install

2. Generate Prisma Client
// turbo
npx prisma generate

3. Push database schema to SQLite
// turbo
npx prisma db push

4. Start the development server
npm run dev
