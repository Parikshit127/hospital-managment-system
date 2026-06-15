/**
 * One-off script: Add ₹20,000 cash payment (backdated 12-Jun-2026)
 * Patient : MS NIENGNEINGAI  (AXT-2026-00109)
 * Invoice : AXT-IPD-26-27-010
 *
 * Run on server:
 *   npx ts-node scripts/add-payment-niengneingai.ts
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
    const INVOICE_NUMBER = 'AXT-IPD-26-27-010';
    const PAYMENT_AMOUNT = 20000;
    const PAYMENT_DATE   = new Date('2026-06-12T10:00:00+05:30');
    const PAYMENT_METHOD = 'Cash';

    // ── 1. Find invoice ────────────────────────────────────────────────
    const invoice = await prisma.invoices.findUnique({
        where: { invoice_number: INVOICE_NUMBER },
    });

    if (!invoice) {
        console.error(`❌  Invoice ${INVOICE_NUMBER} not found. Aborting.`);
        process.exit(1);
    }

    console.log(`✔  Invoice found: ${invoice.invoice_number}`);
    console.log(`   Net Amount  : ₹${Number(invoice.net_amount).toLocaleString('en-IN')}`);
    console.log(`   Paid so far : ₹${Number(invoice.paid_amount).toLocaleString('en-IN')}`);
    console.log(`   Balance Due : ₹${Number(invoice.balance_due).toLocaleString('en-IN')}`);

    if (Number(invoice.balance_due) <= 0) {
        console.error('❌  Invoice already fully paid. Aborting.');
        process.exit(1);
    }

    if (PAYMENT_AMOUNT > Number(invoice.balance_due)) {
        console.error(`❌  Payment ₹${PAYMENT_AMOUNT} exceeds balance ₹${invoice.balance_due}. Aborting.`);
        process.exit(1);
    }

    // ── 2. Generate unique receipt number ─────────────────────────────
    const now = new Date();
    const receiptNumber = `RCP-CASH-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${Date.now().toString().slice(-6)}`;

    // ── 3. Create payment record ───────────────────────────────────────
    const payment = await prisma.payments.create({
        data: {
            receipt_number  : receiptNumber,
            invoice_id      : invoice.id,
            amount          : PAYMENT_AMOUNT,
            payment_method  : PAYMENT_METHOD,
            payment_type    : 'Partial',
            status          : 'Completed',
            notes           : 'Cash payment received on 12-Jun-2026 (backdated entry)',
            organizationId  : invoice.organizationId,
            created_at      : PAYMENT_DATE,
        },
    });

    console.log(`✔  Payment created — Receipt: ${payment.receipt_number}`);

    // ── 4. Update invoice totals ───────────────────────────────────────
    const newPaid    = Number(invoice.paid_amount) + PAYMENT_AMOUNT;
    const newBalance = Number(invoice.net_amount)  - newPaid;
    const newStatus  = newBalance <= 0 ? 'Paid' : 'Partial';

    await prisma.invoices.update({
        where: { id: invoice.id },
        data: {
            paid_amount : newPaid,
            balance_due : Math.max(0, newBalance),
            status      : newStatus,
        },
    });

    console.log(`✔  Invoice updated`);
    console.log(`   Paid Amount : ₹${newPaid.toLocaleString('en-IN')}`);
    console.log(`   Balance Due : ₹${Math.max(0, newBalance).toLocaleString('en-IN')}`);
    console.log(`   New Status  : ${newStatus}`);
    console.log('');
    console.log('✅  Done. Payment of ₹20,000 (Cash) added successfully.');
}

main()
    .catch(e => { console.error('❌  Error:', e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
