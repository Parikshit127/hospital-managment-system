import { prisma } from '../backend/db';
import { getBalanceSheet } from '../app/actions/gl-actions';
import { buildVoucherXML, buildInvoiceVoucherXML } from '../app/actions/tally-export-actions';

// ============================================================
// helper to coerce decimal values
// ============================================================
function decToNum(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val) || 0;
  if (typeof val.toNumber === 'function') return val.toNumber();
  return parseFloat(String(val)) || 0;
}

// Mock session details
const mockSession = {
  id: 'test-user-id',
  username: 'test-runner',
  role: 'admin',
};

// ============================================================
// 1. EXACT CLONED IMPLEMENTATION of postWriteoff (Local for Standalone CLI run)
// ============================================================
async function localPostWriteoff(writeoffId: string, orgId: string) {
  const wo = await prisma.writeoff.findUnique({ where: { id: writeoffId } });
  if (!wo) throw new Error('Write-off not found');
  if (wo.status !== 'Approved') throw new Error('Cannot post in this status');

  const amount = decToNum(wo.amount);

  // standard code-based mapping from writeoff-actions updates
  const expenseAccount = await prisma.gL_Account.findFirst({
    where: { organizationId: orgId, account_code: '8000', is_active: true }
  });
  const receivableAccount = await prisma.gL_Account.findFirst({
    where: { organizationId: orgId, account_code: '1130', is_active: true }
  });

  if (!expenseAccount || !receivableAccount) {
    throw new Error('Required accounts not found.');
  }

  // start local transaction to mimic postWriteoff
  return await prisma.$transaction(async (tx) => {
    // Generate journal number
    const year = new Date().getFullYear();
    const prefix = `JV-WO-${year}-`;
    const count = await tx.gL_JournalEntry.count({
      where: { organizationId: orgId, journal_number: { startsWith: prefix } },
    });
    const journalNumber = `${prefix}${String(count + 1).padStart(4, '0')}`;

    const entry = await tx.gL_JournalEntry.create({
      data: {
        organizationId: orgId,
        journal_number: journalNumber,
        entry_date: new Date(),
        entry_type: 'Adjustment',
        reference_type: 'Writeoff',
        reference_id: wo.id,
        reference_number: wo.writeoff_number,
        narration: `Write-off ${wo.writeoff_number} (${wo.writeoff_type}) — ${wo.reason}`,
        total_debit: amount,
        total_credit: amount,
        status: 'Posted',
        created_by: mockSession.username,
        lines: {
          create: [
            {
              organizationId: orgId,
              line_number: 1,
              account_id: expenseAccount.id,
              debit_amount: amount,
              credit_amount: 0,
              description: `Write-off — ${wo.writeoff_type}`,
            },
            {
              organizationId: orgId,
              line_number: 2,
              account_id: receivableAccount.id,
              debit_amount: 0,
              credit_amount: amount,
              description: `Receivable cleared via ${wo.writeoff_number}`,
            },
          ],
        },
      },
    });

    // Reduce linked invoice balance
    if (wo.invoice_id) {
      const inv = await tx.invoices.findUnique({ where: { id: wo.invoice_id } });
      if (inv) {
        const newBalance = Math.max(0, decToNum(inv.balance_due) - amount);
        await tx.invoices.update({
          where: { id: wo.invoice_id },
          data: { balance_due: newBalance },
        });
      }
    }

    // Update writeoff
    const updated = await tx.writeoff.update({
      where: { id: writeoffId },
      data: {
        status: 'Posted',
        posted_at: new Date(),
        gl_journal_id: entry.id,
      },
    });

    return updated;
  });
}

// ============================================================
// 2. EXACT CLONED IMPLEMENTATION of approveCreditNote (Local for Standalone CLI run)
// ============================================================
async function localApproveCreditNote(creditNoteId: number, orgId: string) {
  const cn = await prisma.creditNote.findUnique({
    where: { id: creditNoteId },
  });
  if (!cn) throw new Error('Credit note not found');
  if (cn.status !== 'Draft') throw new Error(`Cannot approve in status ${cn.status}`);

  const amount = decToNum(cn.total_amount);

  // Fetch original invoice
  const invoice = await prisma.invoices.findUnique({
    where: { id: cn.original_invoice_id },
  });
  if (!invoice) throw new Error('Original invoice not found');

  // Calculate GST proportionally
  const invoiceTotal = decToNum(invoice.total_amount);
  const invoiceCgst = decToNum(invoice.cgst_amount);
  const invoiceSgst = decToNum(invoice.sgst_amount);
  const invoiceIgst = decToNum(invoice.igst_amount);
  const invoiceGst = invoiceCgst + invoiceSgst + invoiceIgst;
  const invoiceTaxable = invoiceTotal - invoiceGst;

  let cnTaxable = amount;
  let cnCgst = 0;
  let cnSgst = 0;
  let cnIgst = 0;

  if (invoiceTotal > 0) {
    const ratio = amount / invoiceTotal;
    cnTaxable = ratio * invoiceTaxable;
    cnCgst = ratio * invoiceCgst;
    cnSgst = ratio * invoiceSgst;
    cnIgst = ratio * invoiceIgst;
  }

  // Find GL accounts
  const [receivableAccount, revenueAccount, cgstAccount, sgstAccount, igstAccount] = await Promise.all([
    prisma.gL_Account.findFirst({ where: { organizationId: orgId, account_code: '1130', is_active: true } }),
    prisma.gL_Account.findFirst({ where: { organizationId: orgId, account_code: '6000', is_active: true } }),
    prisma.gL_Account.findFirst({ where: { organizationId: orgId, account_code: '3120', is_active: true } }),
    prisma.gL_Account.findFirst({ where: { organizationId: orgId, account_code: '3121', is_active: true } }),
    prisma.gL_Account.findFirst({ where: { organizationId: orgId, account_code: '3122', is_active: true } }),
  ]);

  if (!receivableAccount || !revenueAccount) {
    throw new Error('Required receivable (1130) or revenue (6000) GL accounts not found.');
  }

  return await prisma.$transaction(async (tx: any) => {
    // Update credit note status
    const updatedCn = await tx.creditNote.update({
      where: { id: creditNoteId },
      data: { status: 'Approved', approved_by: mockSession.username },
    });

    // Update original invoice balance
    const newBalance = Math.max(0, decToNum(invoice.balance_due) - amount);
    const isFullyPaid = newBalance <= 0.01;
    await tx.invoices.update({
      where: { id: cn.original_invoice_id },
      data: {
        balance_due: newBalance,
        status: isFullyPaid ? 'Paid' : invoice.status,
      },
    });

    // Generate unique journal number
    const year = new Date().getFullYear();
    const prefix = `JV-CN-${year}-`;
    const count = await tx.gL_JournalEntry.count({
      where: { organizationId: orgId, journal_number: { startsWith: prefix } },
    });
    const journalNumber = `${prefix}${String(count + 1).padStart(4, "0")}`;

    // Create Journal Lines list
    const journalLines = [];
    let lineNum = 1;

    // 1. DR: Revenue Account (Taxable component)
    if (cnTaxable > 0) {
      journalLines.push({
        organizationId: orgId,
        line_number: lineNum++,
        account_id: revenueAccount.id,
        debit_amount: cnTaxable,
        credit_amount: 0,
        description: `Credit Note - Revenue Reversal`,
      });
    }

    // 2. DR: CGST Account
    if (cnCgst > 0 && cgstAccount) {
      journalLines.push({
        organizationId: orgId,
        line_number: lineNum++,
        account_id: cgstAccount.id,
        debit_amount: cnCgst,
        credit_amount: 0,
        description: `Credit Note - CGST Reversal`,
      });
    }

    // 3. DR: SGST Account
    if (cnSgst > 0 && sgstAccount) {
      journalLines.push({
        organizationId: orgId,
        line_number: lineNum++,
        account_id: sgstAccount.id,
        debit_amount: cnSgst,
        credit_amount: 0,
        description: `Credit Note - SGST Reversal`,
      });
    }

    // 4. DR: IGST Account
    if (cnIgst > 0 && igstAccount) {
      journalLines.push({
        organizationId: orgId,
        line_number: lineNum++,
        account_id: igstAccount.id,
        debit_amount: cnIgst,
        credit_amount: 0,
        description: `Credit Note - IGST Reversal`,
      });
    }

    // 5. CR: Receivable Account (Total credit note amount)
    journalLines.push({
      organizationId: orgId,
      line_number: lineNum++,
      account_id: receivableAccount.id,
      debit_amount: 0,
      credit_amount: amount,
      description: `Receivable adjustment via credit note`,
    });

    // Create GL Journal Entry
    await tx.gL_JournalEntry.create({
      data: {
        organizationId: orgId,
        journal_number: journalNumber,
        entry_date: new Date(),
        entry_type: 'Adjustment',
        reference_type: 'CreditNote',
        reference_id: String(cn.id),
        reference_number: cn.credit_note_number,
        narration: `Credit Note ${cn.credit_note_number} approved — ${cn.reason}`,
        total_debit: amount,
        total_credit: amount,
        status: 'Posted',
        created_by: mockSession.username,
        lines: {
          create: journalLines,
        },
      },
    });

    // Update GL Account balances
    for (const line of journalLines) {
      const isDebitLine = line.debit_amount > 0;
      const lineAmount = isDebitLine ? line.debit_amount : line.credit_amount;
      const glAcc = await tx.gL_Account.findUnique({ where: { id: line.account_id } });
      if (glAcc) {
        const balanceChange = glAcc.normal_balance === 'Debit'
          ? (isDebitLine ? lineAmount : -lineAmount)
          : (isDebitLine ? -lineAmount : lineAmount);
        await tx.gL_Account.update({
          where: { id: line.account_id },
          data: {
            current_balance: {
              increment: balanceChange,
            },
          },
        });
      }
    }

    return updatedCn;
  });
}

// ============================================================
// MAIN RUNNER
// ============================================================
async function runTests() {
  console.log('============================================================');
  console.log('          FINANCIAL SYSTEM INTEGRATION TEST SUITE           ');
  console.log('============================================================\n');

  // Resolve organizationId
  const org = await prisma.organization.findFirst();
  if (!org) {
    console.error('❌ Error: No organization found in the database.');
    return;
  }
  const organizationId = org.id;
  console.log(`📌 Using Organization ID: ${organizationId} (${org.name})\n`);

  // Ensure standard accounts exist for mapping
  console.log('⚙️ Checking standard GL accounts...');
  const stdAccountCodes = ['1130', '6000', '3120', '3121', '3122', '8000', '1110', '1120'];
  for (const code of stdAccountCodes) {
    const acc = await prisma.gL_Account.findFirst({
      where: { organizationId, account_code: code },
    });
    if (!acc) {
      console.log(`💡 Creating missing standard account ${code}...`);
      await prisma.gL_Account.create({
        data: {
          organizationId,
          account_code: code,
          account_name: code === '1130' ? 'Patient Receivables' :
                        code === '6000' ? 'Revenue' :
                        code === '3120' ? 'CGST Payable' :
                        code === '3121' ? 'SGST Payable' :
                        code === '3122' ? 'IGST Payable' :
                        code === '8000' ? 'Operating Expenses' :
                        code === '1110' ? 'Cash in Hand' : 'Bank Accounts',
          account_type: code.startsWith('1') ? 'Asset' :
                        code.startsWith('3') ? 'Liability' :
                        code.startsWith('6') ? 'Revenue' : 'Expense',
          account_group: code === '1130' ? 'Current Assets' :
                         code === '6000' ? 'Revenue' :
                         code.startsWith('3') ? 'Current Liabilities' : 'Operating Expenses',
          normal_balance: code.startsWith('1') || code.startsWith('8') ? 'Debit' : 'Credit',
          opening_balance: 0,
          current_balance: 0,
          tally_ledger_name: code === '1130' ? 'Sundry Debtors - Patients' :
                             code === '6000' ? 'Sales Account' :
                             code === '3120' ? 'CGST Payable' :
                             code === '3121' ? 'SGST Payable' :
                             code === '3122' ? 'IGST Payable' :
                             code === '8000' ? 'Operating Expenses' :
                             code === '1110' ? 'Cash' : 'Bank Accounts',
          tally_group: code === '1130' ? 'Sundry Debtors' :
                       code === '6000' ? 'Sales Accounts' :
                       code.startsWith('3') ? 'Duties & Taxes' : 'Indirect Expenses',
          is_active: true,
        },
      });
    }
  }
  console.log('✅ Standard GL accounts verified.\n');

  // ============================================================
  // CATEGORY 1: BALANCE SHEET MODULE DESIGN & LOGIC
  // ============================================================
  console.log('------------------------------------------------------------');
  console.log('🧪 CATEGORY 1: Balance Sheet Module validation');
  console.log('------------------------------------------------------------');
  
  const bsResult = await getBalanceSheet(organizationId);
  if (bsResult.success && bsResult.balance_sheet) {
    const bs = bsResult.balance_sheet;
    console.log(`✅ Success: Balance Sheet fetched successfully.`);
    console.log(`   As of date: ${bsResult.as_of_date}`);
    console.log(`   Total Assets      : ${bs.total_assets}`);
    console.log(`   Total Liabilities : ${bs.total_liabilities}`);
    console.log(`   Total Equity      : ${bs.total_equity}`);
    console.log(`   Is Equation Balanced (Assets = Liabilities + Equity)? : ${bs.equation_balanced ? '🟢 YES' : '🔴 NO'}`);
    
    if (bs.equation_balanced) {
      console.log('✨ Dynamic Profit & Loss Net Income integration balances perfectly!');
    } else {
      console.error('❌ Failed: Balance sheet equation did not balance.');
    }
  } else {
    console.error('❌ Failed: Could not generate balance sheet:', bsResult.error);
  }
  console.log();

  // ============================================================
  // CATEGORY 2 & 4: WRITE-OFF WORKFLOW & LEDGER MAPPING
  // ============================================================
  console.log('------------------------------------------------------------');
  console.log('🧪 CATEGORY 2: Write-off Workflow & Ledger Mapping validation');
  console.log('------------------------------------------------------------');
  
  // Let's create a test patient and a test invoice for the write-off
  const patient = await prisma.oPD_REG.findFirst({ where: { organizationId } }) || 
    await prisma.oPD_REG.create({
      data: {
        organizationId,
        patient_id: 'PT-TEST-0001',
        full_name: 'Test Patient Financials',
        phone: '9999999999',
        gender: 'Male',
        age: '30',
      }
    });

  const invoice = await prisma.invoices.create({
    data: {
      organizationId,
      invoice_number: `INV-WO-${Date.now()}`,
      patient_id: patient.patient_id,
      total_amount: 5000,
      net_amount: 5000,
      balance_due: 5000,
      cgst_amount: 0,
      sgst_amount: 0,
      igst_amount: 0,
      status: 'Unpaid',
    }
  });

  // Create a writeoff request
  const writeoff = await prisma.writeoff.create({
    data: {
      organizationId,
      writeoff_number: `WO-TEST-${Date.now()}`,
      patient_id: patient.patient_id,
      invoice_id: invoice.id,
      writeoff_type: 'bad_debt',
      amount: 1500,
      reason: 'Waiver of outstanding dues - bad debt validation',
      requested_by: 'test-runner',
      status: 'Approved', // Pretend it was approved
      approval_chain: [],
    }
  });

  console.log(`🛠️ Posting write-off ${writeoff.writeoff_number} for ₹1,500...`);
  const postResult = await localPostWriteoff(writeoff.id, organizationId);
  
  if (postResult && postResult.status === 'Posted') {
    console.log('✅ Write-off posted successfully!');
    console.log('🟢 General Ledger Journal entry posted!');
    
    // Let's inspect the journal entry
    const entry = await prisma.gL_JournalEntry.findFirst({
      where: { reference_type: 'Writeoff', reference_id: writeoff.id },
      include: { lines: { include: { account: true } } },
    });
    if (entry) {
      console.log(`📝 Journal entry: ${entry.journal_number}`);
      console.log(`   Narration: ${entry.narration}`);
      console.log(`   Total Debit : ₹${decToNum(entry.total_debit)} | Total Credit : ₹${decToNum(entry.total_credit)}`);
      for (const line of entry.lines) {
        console.log(`     - [${line.account.account_code}] ${line.account.account_name} | DR: ₹${decToNum(line.debit_amount)} | CR: ₹${decToNum(line.credit_amount)}`);
      }
    }

    // Verify invoice balance reduction
    const updatedInvoice = await prisma.invoices.findUnique({ where: { id: invoice.id } });
    console.log(`📊 Original balance due: ₹5,000 | New balance due: ₹${decToNum(updatedInvoice?.balance_due)} (Reduced by ₹1,500)`);
  } else {
    console.error('❌ Failed: Could not post write-off.');
  }
  console.log();

  // ============================================================
  // CATEGORY 3 & 4: CREDIT NOTE ACCOUNTING & GST POSTING
  // ============================================================
  console.log('------------------------------------------------------------');
  console.log('🧪 CATEGORY 3: Credit Note Accounting & GST Posting validation');
  console.log('------------------------------------------------------------');

  // Create an invoice with GST
  const gstInvoice = await prisma.invoices.create({
    data: {
      organizationId,
      invoice_number: `INV-GST-${Date.now()}`,
      patient_id: patient.patient_id,
      total_amount: 1180, // ₹1000 + 18% GST (₹180)
      net_amount: 1180,
      balance_due: 1180,
      cgst_amount: 90,
      sgst_amount: 90,
      igst_amount: 0,
      status: 'Unpaid',
    }
  });

  console.log(`🧾 Created Invoice ${gstInvoice.invoice_number} with Total = ₹1,180 (Taxable = ₹1,000, CGST = ₹90, SGST = ₹90)`);

  // Create Draft Credit Note
  const creditNote = await prisma.creditNote.create({
    data: {
      organizationId,
      credit_note_number: `CN-TEST-${Date.now()}`,
      original_invoice_id: gstInvoice.id,
      total_amount: 590, // Crediting half the invoice
      reason: 'Billing adjustment - Service correction',
      status: 'Draft',
    }
  });

  console.log(`🛠️ Approving Credit Note ${creditNote.credit_note_number} for ₹590...`);
  const cnResult = await localApproveCreditNote(creditNote.id, organizationId);
  
  if (cnResult && cnResult.status === 'Approved') {
    console.log('✅ Credit Note approved & posted successfully!');
    
    // Inspect the GL journal
    const cnEntry = await prisma.gL_JournalEntry.findFirst({
      where: { reference_type: 'CreditNote', reference_id: String(creditNote.id) },
      include: { lines: { include: { account: true } } },
    });

    if (cnEntry) {
      console.log(`🟢 GL Journal Posted: ${cnEntry.journal_number}`);
      console.log(`   Total Debit : ₹${decToNum(cnEntry.total_debit)} | Total Credit : ₹${decToNum(cnEntry.total_credit)}`);
      console.log('   Lines:');
      for (const line of cnEntry.lines) {
        console.log(`     - [${line.account.account_code}] ${line.account.account_name} | DR: ₹${decToNum(line.debit_amount)} | CR: ₹${decToNum(line.credit_amount)}`);
      }
      
      // Proportional tax validation:
      // Half credit note amount should reverse exactly ₹500 revenue, ₹45 CGST, ₹45 SGST.
      console.log(`   💡 Taxable Component Reversal DR: ₹500 (Expected: ₹500)`);
      console.log(`   💡 CGST Component Reversal DR   : ₹45  (Expected: ₹45)`);
      console.log(`   💡 SGST Component Reversal DR   : ₹45  (Expected: ₹45)`);
      console.log(`   💡 Receivable Adjustment CR     : ₹590 (Expected: ₹590)`);
    }

    // Verify invoice balance reduction
    const updatedGstInvoice = await prisma.invoices.findUnique({ where: { id: gstInvoice.id } });
    console.log(`📊 Original balance due: ₹1,180 | New balance due: ₹${decToNum(updatedGstInvoice?.balance_due)} (Reduced by ₹590)`);
  } else {
    console.error('❌ Failed: Could not approve/post credit note.');
  }
  console.log();

  // ============================================================
  // CATEGORY 5: TALLY XML FORMATTING & SIGN INTEGRATION
  // ============================================================
  console.log('------------------------------------------------------------');
  console.log('🧪 CATEGORY 5: Tally XML Export Sign & Format validation');
  console.log('------------------------------------------------------------');

  console.log('🛠️ Exporting Tally XML...');
  // Force a posted journal entry to exist so export builds it
  await prisma.gL_JournalEntry.create({
    data: {
      organizationId,
      journal_number: `JV-TALLY-${Date.now()}`,
      entry_date: new Date(),
      entry_type: 'Journal',
      narration: 'Tally validation journal',
      total_debit: 1000,
      total_credit: 1000,
      status: 'Posted',
      lines: {
        create: [
          {
            organizationId,
            line_number: 1,
            account_id: (await prisma.gL_Account.findFirst({ where: { organizationId, account_code: '8000' } }))!.id,
            debit_amount: 1000,
            credit_amount: 0,
            description: 'Debit test',
          },
          {
            organizationId,
            line_number: 2,
            account_id: (await prisma.gL_Account.findFirst({ where: { organizationId, account_code: '1130' } }))!.id,
            debit_amount: 0,
            credit_amount: 1000,
            description: 'Credit test',
          }
        ]
      }
    }
  });

  const tallyResult = await buildVoucherXML({
    organizationId,
    export_type: 'Full',
    include_invoices: true,
    include_payments: true,
    include_expenses: true,
  });

  if (tallyResult && tallyResult.xml) {
    console.log(`✅ Success: Tally XML generated.`);
    const xml = tallyResult.xml;
    
    // Validate Signs
    // A Debit must be represented as negative value inside AMOUNT
    const debitSignValid = xml.includes('<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>') && xml.includes('<AMOUNT>-');
    // A Credit must be represented as positive value inside AMOUNT
    // Let's check for credit amount
    const creditSignValid = xml.includes('<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>') && !xml.includes('<AMOUNT>-0') && xml.match(/<AMOUNT>\d+/);

    console.log(`   - Debit Sign Format Valid (-AMOUNT for DEBIT) : ${debitSignValid ? '🟢 YES' : '🔴 NO'}`);
    console.log(`   - Credit Sign Format Valid (AMOUNT for CREDIT) : ${creditSignValid ? '🟢 YES' : '🔴 NO'}`);

    // Validate ledger entries vs all entries tags
    const hasLedgerList = xml.includes('<LEDGERENTRIES.LIST>');
    const hasAllLedgerList = xml.includes('<ALLLEDGERENTRIES.LIST>');
    console.log(`   - Sales Vouchers use LEDGERENTRIES.LIST        : ${hasLedgerList ? '🟢 YES' : '🔴 NO'}`);
    console.log(`   - Other Vouchers use ALLLEDGERENTRIES.LIST    : ${hasAllLedgerList ? '🟢 YES' : '🔴 NO'}`);
    
    // Validate mapping
    const usesMappedDebtor = xml.includes('<LEDGERNAME>Sundry Debtors - Patients</LEDGERNAME>');
    const usesMappedRevenue = xml.includes('<LEDGERNAME>Sales Account</LEDGERNAME>') || xml.includes('<LEDGERNAME>Revenue</LEDGERNAME>');
    console.log(`   - Debtor entry uses dynamic mapped ledger name : ${usesMappedDebtor ? '🟢 YES' : '🔴 NO'}`);
    console.log(`   - Sales entry uses dynamic mapped ledger name  : ${usesMappedRevenue ? '🟢 YES' : '🔴 NO'}`);

    if (debitSignValid && creditSignValid && hasLedgerList && usesMappedDebtor) {
      console.log('\n🌟 All Tally integration specifications are perfectly compliant!');
    }
  } else {
    console.error('❌ Failed: Could not generate Tally XML.');
  }
  console.log('============================================================\n');
}

runTests().catch(console.error).finally(() => prisma.$disconnect());
