'use server';

import { prisma } from '@/backend/db';
import { requireRoleAndTenant } from '@/backend/tenant';
import { createJournalEntry } from '@/app/actions/gl-actions';
import { INVENTORY_FINANCE_ROLES, INVENTORY_VIEW_ROLES } from '@/app/lib/inventory-roles';

async function getAccountByCode(organizationId: string, accountCode: string) {
  return prisma.gL_Account.findFirst({
    where: { organizationId, account_code: accountCode, is_active: true },
  });
}

async function getCategoryAccounts(categoryId: number) {
  const cat = await prisma.item_categories.findFirst({
    where: { id: categoryId },
    select: {
      gl_inventory_account_id: true,
      gl_expense_account_id: true,
      gl_cogs_account_id: true,
      name: true,
    },
  });
  return cat;
}

async function resolveInventoryAccount(organizationId: string, categoryId: number) {
  const cat = await getCategoryAccounts(categoryId);
  if (cat?.gl_inventory_account_id) {
    const acc = await prisma.gL_Account.findFirst({ where: { id: cat.gl_inventory_account_id } });
    if (acc) return acc;
  }
  return getAccountByCode(organizationId, '1310'); // Inventory fallback
}

async function resolveClearingAccount(organizationId: string) {
  return (
    (await getAccountByCode(organizationId, '2140')) ||
    (await getAccountByCode(organizationId, '3115'))
  );
}

async function resolveShrinkageAccount(organizationId: string) {
  return getAccountByCode(organizationId, '8010') || getAccountByCode(organizationId, '8000');
}

async function resolveOpeningEquityAccount(organizationId: string) {
  return getAccountByCode(organizationId, '3200') || getAccountByCode(organizationId, '3000');
}

async function resolveVendorPayableAccount(organizationId: string) {
  return getAccountByCode(organizationId, '3110');
}

async function resolveCogsAccount(organizationId: string, categoryId: number) {
  const cat = await getCategoryAccounts(categoryId);
  if (cat?.gl_cogs_account_id) {
    const acc = await prisma.gL_Account.findFirst({ where: { id: cat.gl_cogs_account_id } });
    if (acc) return acc;
  }
  return getAccountByCode(organizationId, '5100');
}

async function resolveExpenseAccount(organizationId: string, categoryId: number) {
  const cat = await getCategoryAccounts(categoryId);
  if (cat?.gl_expense_account_id) {
    const acc = await prisma.gL_Account.findFirst({ where: { id: cat.gl_expense_account_id } });
    if (acc) return acc;
  }
  return getAccountByCode(organizationId, '8000');
}

async function linkMovementToJournal(movementIds: number[], journalId: string) {
  if (!movementIds.length) return;
  await prisma.inventory_movements.updateMany({
    where: { id: { in: movementIds } },
    data: { gl_journal_id: journalId, gl_posted: true },
  });
}

export async function postGrnToGL(grnId: number, movementIds: number[] = []) {
  try {
    const grn = await prisma.goodsReceiptNote.findFirst({
      where: { id: grnId },
      include: {
        stores: { select: { cost_center: true, name: true } },
        goods_receipt_note_items: { include: { item_master: { include: { item_categories: true } } } },
      },
    });
    if (!grn) return { success: false, error: 'GRN not found' };

    const existing = await prisma.gL_JournalEntry.findFirst({
      where: { reference_type: 'GRN', reference_id: String(grnId), status: { not: 'Reversed' } },
    });
    if (existing) return { success: true, journal: existing };

    const clearing = await resolveClearingAccount(grn.organizationId);
    if (!clearing) return { success: false, error: 'GR-IR clearing account not configured (2140)' };

    const lines: any[] = [];
    let totalValue = 0;

    for (const line of grn.goods_receipt_note_items) {
      const value = line.quantity_accepted * line.unit_price;
      totalValue += value;
      const invAcc = await resolveInventoryAccount(grn.organizationId, line.item_master.category_id);
      if (!invAcc) continue;
      lines.push({
        account_id: invAcc.id,
        debit_amount: value,
        credit_amount: 0,
        description: `GRN ${grn.grn_number} — ${line.item_master.name}`,
        cost_center: grn.stores?.cost_center,
      });
    }

    lines.push({
      account_id: clearing.id,
      debit_amount: 0,
      credit_amount: totalValue,
      description: `GR-IR Clearing — ${grn.grn_number}`,
    });

    const result = await createJournalEntry({
      organizationId: grn.organizationId,
      entry_date: grn.received_at,
      entry_type: 'Inventory_GRN',
      narration: `Goods received — ${grn.grn_number}`,
      lines,
      reference_type: 'GRN',
      reference_id: String(grnId),
      reference_number: grn.grn_number,
    });

    if (result.success && result.journal?.id) {
      await linkMovementToJournal(movementIds, result.journal.id);
    }
    return result;
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function postPurchaseInvoiceToGL(invoiceId: number) {
  try {
    const invoice = await prisma.pharmacyPurchaseInvoice.findFirst({
      where: { id: invoiceId },
      include: { line_items: { include: { item_master: true } } },
    });
    if (!invoice) return { success: false, error: 'Invoice not found' };

    const clearing = await resolveClearingAccount(invoice.organizationId);
    const payable = await resolveVendorPayableAccount(invoice.organizationId);
    if (!clearing || !payable) return { success: false, error: 'GL accounts missing' };

    const gstInput = await getAccountByCode(invoice.organizationId, '1410');

    const lines: any[] = [
      {
        account_id: clearing.id,
        debit_amount: Number(invoice.subtotal),
        credit_amount: 0,
        description: 'Clear GR-IR',
      },
    ];

    if (gstInput && Number(invoice.cgst_amount) + Number(invoice.sgst_amount) + Number(invoice.igst_amount) > 0) {
      lines.push({
        account_id: gstInput.id,
        debit_amount: Number(invoice.cgst_amount) + Number(invoice.sgst_amount) + Number(invoice.igst_amount),
        credit_amount: 0,
        description: 'GST Input Credit',
      });
    }

    lines.push({
      account_id: payable.id,
      debit_amount: 0,
      credit_amount: Number(invoice.total_amount),
      description: `Vendor payable — ${invoice.invoice_number}`,
    });

    return createJournalEntry({
      organizationId: invoice.organizationId,
      entry_date: invoice.invoice_date,
      entry_type: 'Inventory_PurchaseInvoice',
      narration: `Purchase invoice — ${invoice.invoice_number}`,
      lines,
      reference_type: 'PurchaseInvoice',
      reference_id: String(invoiceId),
      reference_number: invoice.invoice_number,
    });
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function postConsumptionToGL(params: {
  organizationId: string;
  itemId: number;
  categoryId: number;
  value: number;
  costCenter?: string;
  movementIds: number[];
  isPatientChargeable?: boolean;
  referenceNumber?: string;
}) {
  try {
    const invAcc = await resolveInventoryAccount(params.organizationId, params.categoryId);
    const expenseAcc = params.isPatientChargeable
      ? await resolveCogsAccount(params.organizationId, params.categoryId)
      : await resolveExpenseAccount(params.organizationId, params.categoryId);

    if (!invAcc || !expenseAcc) return { success: false, error: 'GL accounts not configured' };

    const result = await createJournalEntry({
      organizationId: params.organizationId,
      entry_date: new Date(),
      entry_type: params.isPatientChargeable ? 'Inventory_COGS' : 'Inventory_Consumption',
      narration: `Stock consumption — ${params.referenceNumber || params.itemId}`,
      lines: [
        {
          account_id: expenseAcc.id,
          debit_amount: params.value,
          credit_amount: 0,
          description: 'Consumption expense / COGS',
          cost_center: params.costCenter,
        },
        {
          account_id: invAcc.id,
          debit_amount: 0,
          credit_amount: params.value,
          description: 'Inventory reduction',
          cost_center: params.costCenter,
        },
      ],
      reference_type: 'InventoryConsumption',
      reference_id: String(params.movementIds[0] || ''),
    });

    if (result.success && result.journal?.id) {
      await linkMovementToJournal(params.movementIds, result.journal.id);
    }
    return result;
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function postWriteOffToGL(params: {
  organizationId: string;
  categoryId: number;
  value: number;
  costCenter?: string;
  movementIds: number[];
  reason: string;
}) {
  try {
    const invAcc = await resolveInventoryAccount(params.organizationId, params.categoryId);
    const shrinkAcc = await resolveShrinkageAccount(params.organizationId);
    if (!invAcc || !shrinkAcc) return { success: false, error: 'GL accounts not configured' };

    const result = await createJournalEntry({
      organizationId: params.organizationId,
      entry_date: new Date(),
      entry_type: 'Inventory_WriteOff',
      narration: `Inventory write-off — ${params.reason}`,
      lines: [
        { account_id: shrinkAcc.id, debit_amount: params.value, credit_amount: 0, description: params.reason, cost_center: params.costCenter },
        { account_id: invAcc.id, debit_amount: 0, credit_amount: params.value, description: 'Inventory write-off' },
      ],
      reference_type: 'InventoryWriteOff',
      reference_id: String(params.movementIds[0] || ''),
    });

    if (result.success && result.journal?.id) {
      await linkMovementToJournal(params.movementIds, result.journal.id);
    }
    return result;
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function postAdjustmentToGL(params: {
  organizationId: string;
  categoryId: number;
  varianceValue: number;
  costCenter?: string;
  movementIds: number[];
  adjustmentNumber: string;
}) {
  try {
    const invAcc = await resolveInventoryAccount(params.organizationId, params.categoryId);
    const shrinkAcc = await resolveShrinkageAccount(params.organizationId);
    if (!invAcc || !shrinkAcc) return { success: false, error: 'GL accounts not configured' };

    const isShortage = params.varianceValue < 0;
    const amount = Math.abs(params.varianceValue);

    const lines = isShortage
      ? [
          { account_id: shrinkAcc.id, debit_amount: amount, credit_amount: 0, description: 'Count shortage' },
          { account_id: invAcc.id, debit_amount: 0, credit_amount: amount, description: 'Inventory adjustment' },
        ]
      : [
          { account_id: invAcc.id, debit_amount: amount, credit_amount: 0, description: 'Count excess' },
          { account_id: shrinkAcc.id, debit_amount: 0, credit_amount: amount, description: 'Inventory gain' },
        ];

    const result = await createJournalEntry({
      organizationId: params.organizationId,
      entry_date: new Date(),
      entry_type: 'Inventory_Adjustment',
      narration: `Stock count adjustment — ${params.adjustmentNumber}`,
      lines,
      reference_type: 'StockAdjustment',
      reference_id: params.adjustmentNumber,
    });

    if (result.success && result.journal?.id) {
      await linkMovementToJournal(params.movementIds, result.journal.id);
    }
    return result;
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function postOpeningStockToGL(params: {
  organizationId: string;
  totalValue: number;
  storeName: string;
  movementIds: number[];
}) {
  try {
    const invAcc = await getAccountByCode(params.organizationId, '1310');
    const equityAcc = await resolveOpeningEquityAccount(params.organizationId);
    if (!invAcc || !equityAcc) return { success: false, error: 'Opening GL accounts not configured' };

    const result = await createJournalEntry({
      organizationId: params.organizationId,
      entry_date: new Date(),
      entry_type: 'Inventory_Opening',
      narration: `Opening stock — ${params.storeName}`,
      lines: [
        { account_id: invAcc.id, debit_amount: params.totalValue, credit_amount: 0, description: 'Opening inventory' },
        { account_id: equityAcc.id, debit_amount: 0, credit_amount: params.totalValue, description: 'Opening balance equity' },
      ],
      reference_type: 'OpeningStock',
      reference_id: params.storeName,
    });

    if (result.success && result.journal?.id) {
      await linkMovementToJournal(params.movementIds, result.journal.id);
    }
    return result;
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function postInterBranchTransferToGL(params: {
  organizationId: string;
  value: number;
  fromCostCenter?: string;
  toCostCenter?: string;
  transferNumber: string;
}) {
  try {
    const invFrom = await getAccountByCode(params.organizationId, '1310');
    const invTo = invFrom;
    if (!invFrom) return { success: false, error: 'Inventory account not configured' };

    return createJournalEntry({
      organizationId: params.organizationId,
      entry_date: new Date(),
      entry_type: 'Inventory_Transfer',
      narration: `Inter-branch transfer — ${params.transferNumber}`,
      lines: [
        { account_id: invTo!.id, debit_amount: params.value, credit_amount: 0, description: 'Receive branch', cost_center: params.toCostCenter },
        { account_id: invFrom.id, debit_amount: 0, credit_amount: params.value, description: 'Send branch', cost_center: params.fromCostCenter },
      ],
      reference_type: 'StockTransfer',
      reference_id: params.transferNumber,
    });
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function reconcileInventoryToGL(storeId?: number) {
  try {
    const { db, organizationId } = await requireRoleAndTenant([...INVENTORY_FINANCE_ROLES]);

    const stocks = await db.store_stocks.findMany({
      where: storeId ? { store_id: storeId } : {},
      include: { item_master: { include: { item_categories: true } }, stores: true },
    });

    const ledgerValue = stocks.reduce(
      (s: number, r: any) => s + r.quantity_on_hand * r.avg_unit_cost,
      0,
    );

    const unposted = await db.inventory_movements.count({
      where: { gl_posted: false, movement_type: { notIn: ['TRANSFER_OUT', 'TRANSFER_IN', 'INDENT_RECEIPT'] } },
    });

    const categoryBreakdown: Record<string, number> = {};
    for (const row of stocks) {
      const cat = row.item_master?.item_categories?.name || 'Uncategorized';
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + row.quantity_on_hand * row.avg_unit_cost;
    }

    return {
      success: true,
      data: {
        ledgerValue: Math.round(ledgerValue),
        unpostedMovements: unposted,
        categoryBreakdown,
        storeId: storeId || 'all',
      },
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function retryUnpostedGLMovements(limit = 50) {
  try {
    const { db, organizationId } = await requireRoleAndTenant(['admin', 'finance']);
    const movements = await db.inventory_movements.findMany({
      where: { gl_posted: false, movement_type: { in: ['GRN_RECEIPT', 'CONSUMPTION', 'EXPIRY_WRITEOFF', 'ADJUSTMENT_MINUS', 'ADJUSTMENT_PLUS', 'OPENING'] } },
      take: limit,
      include: { item_master: true },
    });

    let retried = 0;
    for (const m of movements) {
      if (m.movement_type === 'GRN_RECEIPT' && m.source_id) {
        const res = await postGrnToGL(Number(m.source_id), [m.id]);
        if (res.success) retried++;
      }
    }
    return { success: true, data: { retried, pending: movements.length - retried } };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
