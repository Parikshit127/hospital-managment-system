/**
 * Fully reverse and delete a credit note — undoes GL journal entries,
 * restores invoice balance, and deletes the credit note record.
 *
 * Usage: node scripts/remove-credit-note.js CN-20260608-0827
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const cnNumber = process.argv[2];
    if (!cnNumber) {
        console.error('Usage: node scripts/remove-credit-note.js <credit-note-number>');
        process.exit(1);
    }

    const cn = await prisma.creditNote.findUnique({ where: { credit_note_number: cnNumber } });
    if (!cn) {
        console.error(`Credit note "${cnNumber}" not found.`);
        process.exit(1);
    }

    console.log(`Found: ${cn.credit_note_number} | Invoice ID: ${cn.original_invoice_id} | Amount: ${cn.total_amount} | Status: ${cn.status}`);
    const amount = Number(cn.total_amount);

    await prisma.$transaction(async (tx) => {
        // 1. Find and reverse GL journal entry
        const journal = await tx.gL_JournalEntry.findFirst({
            where: { reference_type: 'CreditNote', reference_id: String(cn.id), organizationId: cn.organizationId },
            include: { lines: true },
        });

        if (journal) {
            console.log(`Reversing journal ${journal.journal_number} (${journal.lines.length} lines)...`);
            for (const line of journal.lines) {
                const isDebit = Number(line.debit_amount) > 0;
                const lineAmount = isDebit ? Number(line.debit_amount) : Number(line.credit_amount);
                const glAcc = await tx.gL_Account.findUnique({ where: { id: line.account_id } });
                if (glAcc) {
                    // Reverse: if original was debit on a Debit-normal account, we subtract
                    const reversal = glAcc.normal_balance === 'Debit'
                        ? (isDebit ? -lineAmount : lineAmount)
                        : (isDebit ? lineAmount : -lineAmount);
                    await tx.gL_Account.update({
                        where: { id: line.account_id },
                        data: { current_balance: { increment: reversal } },
                    });
                    console.log(`  GL ${glAcc.account_code} (${glAcc.account_name}): balance adjusted by ${reversal > 0 ? '+' : ''}${reversal}`);
                }
            }
            // Delete journal lines then journal
            await tx.gL_JournalLine.deleteMany({ where: { journal_entry_id: journal.id } });
            await tx.gL_JournalEntry.delete({ where: { id: journal.id } });
            console.log(`  Deleted journal ${journal.journal_number}`);
        } else {
            console.log('No GL journal entry found (credit note may not have been fully applied).');
        }

        // 2. Restore invoice balance to previous outstanding
        if (cn.status === 'Applied') {
            const invoice = await tx.invoices.findUnique({ where: { id: cn.original_invoice_id } });
            if (invoice) {
                const netAmount = Number(invoice.net_amount);
                const paidAmount = Number(invoice.paid_amount);
                const restoredBalance = Number(invoice.balance_due) + amount;

                // Determine correct status based on actual payments vs net amount
                let restoredStatus = invoice.status;
                if (restoredBalance <= 0.01) {
                    restoredStatus = 'Paid';
                } else if (paidAmount > 0.01) {
                    restoredStatus = 'Partially Paid';
                } else {
                    restoredStatus = 'Unpaid';
                }

                await tx.invoices.update({
                    where: { id: cn.original_invoice_id },
                    data: {
                        balance_due: restoredBalance,
                        status: restoredStatus,
                    },
                });
                console.log(`Invoice ${invoice.invoice_number}:`);
                console.log(`  Net amount:  ${netAmount}`);
                console.log(`  Paid amount: ${paidAmount}`);
                console.log(`  Balance:     ${Number(invoice.balance_due)} -> ${restoredBalance}`);
                console.log(`  Status:      ${invoice.status} -> ${restoredStatus}`);
            }
        }

        // 3. Delete the credit note
        await tx.creditNote.delete({ where: { id: cn.id } });
        console.log(`Credit note ${cnNumber} deleted.`);
    });

    console.log('Done — credit note fully reversed.');
}

main()
    .catch(e => { console.error('Error:', e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
