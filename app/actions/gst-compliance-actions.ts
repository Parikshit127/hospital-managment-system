'use server';

import { prisma } from '@/backend/db';
import { revalidatePath } from 'next/cache';

// ========================================
// GST Register Sync Functions
// ========================================

export async function syncInvoiceToGSTRegister(invoiceId: number) {
  try {
    const invoice = await prisma.invoices.findUnique({
      where: { id: invoiceId },
      include: { patient: true, organization: true },
    });

    if (!invoice) {
      return { success: false, error: 'Invoice not found' };
    }

    // Check if already synced
    const existing = await prisma.gST_Invoice_Register.findFirst({
      where: { invoice_id: invoiceId.toString() },
    });

    if (existing) {
      return { success: true, message: 'Already synced' };
    }

    const taxableAmount =
      invoice.total_amount.toNumber() -
      (invoice.cgst_amount?.toNumber() || 0) -
      (invoice.sgst_amount?.toNumber() || 0) -
      (invoice.igst_amount?.toNumber() || 0);

    const totalTax =
      (invoice.cgst_amount?.toNumber() || 0) +
      (invoice.sgst_amount?.toNumber() || 0) +
      (invoice.igst_amount?.toNumber() || 0);

    await prisma.gST_Invoice_Register.create({
      data: {
        organizationId: invoice.organizationId,
        invoice_id: invoiceId.toString(),
        transaction_type: 'Outward',
        invoice_number: invoice.invoice_number,
        invoice_date: invoice.created_at,
        gstin_supplier: null, // TODO: get from Organization
        gstin_recipient: null, // Most patients don't have GSTIN
        recipient_name: 'Patient',
        recipient_state: null,
        place_of_supply: null, // TODO: get from Organization
        is_inter_state: false,
        reverse_charge: false,
        invoice_type: 'Regular',
        taxable_amount: taxableAmount,
        cgst_amount: invoice.cgst_amount?.toNumber() || 0,
        sgst_amount: invoice.sgst_amount?.toNumber() || 0,
        igst_amount: invoice.igst_amount?.toNumber() || 0,
        cess_amount: 0,
        total_tax: totalTax,
        total_invoice_value: invoice.total_amount.toNumber(),
        hsn_sac_code: '9993', // Default SAC for healthcare services
        gst_rate: 0, // Healthcare is typically exempt, but can be configured
        itc_eligibility: null,
        filing_period: null,
      },
    });

    revalidatePath('/finance/gst-register');
    return { success: true };
  } catch (error) {
    console.error('Error syncing invoice to GST register:', error);
    return { success: false, error: 'Failed to sync invoice' };
  }
}

export async function syncExpenseToGSTRegister(expenseId: number) {
  try {
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: { organization: true },
    });

    if (!expense) {
      return { success: false, error: 'Expense not found' };
    }

    // Check if already synced
    const existing = await prisma.gST_Invoice_Register.findFirst({
      where: { expense_id: expenseId.toString() },
    });

    if (existing) {
      return { success: true, message: 'Already synced' };
    }

    // Only sync if GST amounts exist
    const totalGST =
      (expense.cgst_amount?.toNumber() || 0) +
      (expense.sgst_amount?.toNumber() || 0) +
      (expense.igst_amount?.toNumber() || 0);

    if (totalGST === 0) {
      return { success: true, message: 'No GST to sync' };
    }

    const taxableAmount = expense.amount.toNumber() - totalGST;

    await prisma.gST_Invoice_Register.create({
      data: {
        organizationId: expense.organizationId,
        expense_id: expenseId.toString(),
        transaction_type: 'Inward',
        invoice_number: expense.expense_number,
        invoice_date: expense.created_at,
        gstin_supplier: expense.vendor_gstin,
        gstin_recipient: null, // TODO: get from Organization
        recipient_name: 'Hospital',
        recipient_state: null, // TODO: get from Organization
        place_of_supply: null, // TODO: get from Organization
        is_inter_state: expense.is_inter_state || false,
        reverse_charge: false,
        invoice_type: 'Regular',
        taxable_amount: taxableAmount,
        cgst_amount: expense.cgst_amount?.toNumber() || 0,
        sgst_amount: expense.sgst_amount?.toNumber() || 0,
        igst_amount: expense.igst_amount?.toNumber() || 0,
        cess_amount: 0,
        total_tax: totalGST,
        total_invoice_value: expense.amount.toNumber(),
        hsn_sac_code: expense.hsn_sac_code,
        gst_rate: expense.gst_rate?.toNumber(),
        itc_eligibility: 'Eligible',
        filing_period: null,
      },
    });

    revalidatePath('/finance/gst-register');
    return { success: true };
  } catch (error) {
    console.error('Error syncing expense to GST register:', error);
    return { success: false, error: 'Failed to sync expense' };
  }
}

// ========================================
// GST Register Queries
// ========================================

export async function getGSTRegister(
  organizationId: string,
  filters?: {
    transaction_type?: string;
    start_date?: Date;
    end_date?: Date;
    filing_period?: string;
  }
) {
  try {
    const register = await prisma.gST_Invoice_Register.findMany({
      where: {
        organizationId,
        ...(filters?.transaction_type && {
          transaction_type: filters.transaction_type,
        }),
        ...(filters?.start_date && { invoice_date: { gte: filters.start_date } }),
        ...(filters?.end_date && { invoice_date: { lte: filters.end_date } }),
        ...(filters?.filing_period && { filing_period: filters.filing_period }),
      },
      orderBy: { invoice_date: 'desc' },
    });

    return { success: true, register };
  } catch (error) {
    console.error('Error fetching GST register:', error);
    return { success: false, error: 'Failed to fetch register', register: [] };
  }
}

// ========================================
// GSTR-1 Generation
// ========================================

export async function generateGSTR1(
  organizationId: string,
  filters: {
    filing_period: string; // MMYYYY
    return_period_start: Date;
    return_period_end: Date;
  }
) {
  try {
    const outwardSupplies = await prisma.gST_Invoice_Register.findMany({
      where: {
        organizationId,
        transaction_type: 'Outward',
        invoice_date: {
          gte: filters.return_period_start,
          lte: filters.return_period_end,
        },
      },
    });

    // B2B - Business to Business (invoices with GSTIN)
    const b2b = outwardSupplies
      .filter((inv) => inv.gstin_recipient)
      .map((inv) => ({
        gstin: inv.gstin_recipient,
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        invoice_value: inv.total_invoice_value.toNumber(),
        place_of_supply: inv.place_of_supply,
        reverse_charge: inv.reverse_charge,
        invoice_type: inv.invoice_type,
        taxable_value: inv.taxable_amount.toNumber(),
        cgst: inv.cgst_amount.toNumber(),
        sgst: inv.sgst_amount.toNumber(),
        igst: inv.igst_amount.toNumber(),
        cess: inv.cess_amount.toNumber(),
      }));

    // B2CL - Large invoices to consumers (> 2.5 lakh)
    const b2cl = outwardSupplies
      .filter((inv) => !inv.gstin_recipient && inv.total_invoice_value.toNumber() > 250000)
      .map((inv) => ({
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        invoice_value: inv.total_invoice_value.toNumber(),
        place_of_supply: inv.place_of_supply,
        taxable_value: inv.taxable_amount.toNumber(),
        igst: inv.igst_amount.toNumber(),
      }));

    // B2CS - Small invoices to consumers (< 2.5 lakh)
    const b2csMap = new Map<string, any>();
    outwardSupplies
      .filter((inv) => !inv.gstin_recipient && inv.total_invoice_value.toNumber() <= 250000)
      .forEach((inv) => {
        const key = `${inv.place_of_supply}_${inv.gst_rate}`;
        if (!b2csMap.has(key)) {
          b2csMap.set(key, {
            place_of_supply: inv.place_of_supply,
            gst_rate: inv.gst_rate?.toNumber() || 0,
            taxable_value: 0,
            cgst: 0,
            sgst: 0,
            igst: 0,
            cess: 0,
          });
        }
        const entry = b2csMap.get(key);
        entry.taxable_value += inv.taxable_amount.toNumber();
        entry.cgst += inv.cgst_amount.toNumber();
        entry.sgst += inv.sgst_amount.toNumber();
        entry.igst += inv.igst_amount.toNumber();
        entry.cess += inv.cess_amount.toNumber();
      });
    const b2cs = Array.from(b2csMap.values());

    // HSN Summary
    const hsnMap = new Map<string, any>();
    outwardSupplies.forEach((inv) => {
      const hsn = inv.hsn_sac_code || 'UNKNOWN';
      if (!hsnMap.has(hsn)) {
        hsnMap.set(hsn, {
          hsn_code: hsn,
          description: '',
          uqc: '',
          total_quantity: 0,
          total_value: 0,
          taxable_value: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
        });
      }
      const entry = hsnMap.get(hsn);
      entry.total_value += inv.total_invoice_value.toNumber();
      entry.taxable_value += inv.taxable_amount.toNumber();
      entry.cgst += inv.cgst_amount.toNumber();
      entry.sgst += inv.sgst_amount.toNumber();
      entry.igst += inv.igst_amount.toNumber();
    });
    const hsn = Array.from(hsnMap.values());

    return {
      success: true,
      gstr1: {
        filing_period: filters.filing_period,
        b2b,
        b2cl,
        b2cs,
        hsn,
        summary: {
          total_invoices: outwardSupplies.length,
          total_value: outwardSupplies.reduce(
            (sum, inv) => sum + inv.total_invoice_value.toNumber(),
            0
          ),
          total_taxable: outwardSupplies.reduce(
            (sum, inv) => sum + inv.taxable_amount.toNumber(),
            0
          ),
          total_cgst: outwardSupplies.reduce(
            (sum, inv) => sum + inv.cgst_amount.toNumber(),
            0
          ),
          total_sgst: outwardSupplies.reduce(
            (sum, inv) => sum + inv.sgst_amount.toNumber(),
            0
          ),
          total_igst: outwardSupplies.reduce(
            (sum, inv) => sum + inv.igst_amount.toNumber(),
            0
          ),
        },
      },
    };
  } catch (error) {
    console.error('Error generating GSTR-1:', error);
    return { success: false, error: 'Failed to generate GSTR-1' };
  }
}

// ========================================
// GSTR-3B Generation
// ========================================

export async function generateGSTR3B(
  organizationId: string,
  filters: {
    filing_period: string;
    return_period_start: Date;
    return_period_end: Date;
  }
) {
  try {
    // Outward supplies
    const outward = await prisma.gST_Invoice_Register.findMany({
      where: {
        organizationId,
        transaction_type: 'Outward',
        invoice_date: {
          gte: filters.return_period_start,
          lte: filters.return_period_end,
        },
      },
    });

    // Inward supplies (for ITC)
    const inward = await prisma.gST_Invoice_Register.findMany({
      where: {
        organizationId,
        transaction_type: 'Inward',
        invoice_date: {
          gte: filters.return_period_start,
          lte: filters.return_period_end,
        },
      },
    });

    const outwardTaxableSupplies = outward.reduce(
      (sum, inv) => sum + inv.taxable_amount.toNumber(),
      0
    );
    const outwardTaxLiability = outward.reduce(
      (sum, inv) =>
        sum +
        inv.cgst_amount.toNumber() +
        inv.sgst_amount.toNumber() +
        inv.igst_amount.toNumber(),
      0
    );

    const itcAvailable = inward.reduce(
      (sum, inv) =>
        sum +
        inv.cgst_amount.toNumber() +
        inv.sgst_amount.toNumber() +
        inv.igst_amount.toNumber(),
      0
    );

    const netTaxPayable = outwardTaxLiability - itcAvailable;

    return {
      success: true,
      gstr3b: {
        filing_period: filters.filing_period,
        outward_taxable_supplies: outwardTaxableSupplies,
        outward_tax_liability: outwardTaxLiability,
        itc_available: itcAvailable,
        itc_reversed: 0,
        net_tax_payable: netTaxPayable,
        interest: 0,
        late_fee: 0,
      },
    };
  } catch (error) {
    console.error('Error generating GSTR-3B:', error);
    return { success: false, error: 'Failed to generate GSTR-3B' };
  }
}

// ========================================
// ITC Management
// ========================================

export async function calculateITCAvailable(
  organizationId: string,
  period: { start_date: Date; end_date: Date }
) {
  try {
    const inward = await prisma.gST_Invoice_Register.findMany({
      where: {
        organizationId,
        transaction_type: 'Inward',
        invoice_date: {
          gte: period.start_date,
          lte: period.end_date,
        },
        itc_eligibility: 'Eligible',
      },
    });

    const totalITC = inward.reduce(
      (sum, inv) =>
        sum +
        inv.cgst_amount.toNumber() +
        inv.sgst_amount.toNumber() +
        inv.igst_amount.toNumber(),
      0
    );

    return { success: true, itc_available: totalITC };
  } catch (error) {
    console.error('Error calculating ITC:', error);
    return { success: false, error: 'Failed to calculate ITC' };
  }
}

// ========================================
// HSN/SAC Management
// ========================================

export async function getHSNSummary(
  organizationId: string,
  filters: { start_date: Date; end_date: Date }
) {
  try {
    const register = await prisma.gST_Invoice_Register.findMany({
      where: {
        organizationId,
        invoice_date: {
          gte: filters.start_date,
          lte: filters.end_date,
        },
      },
    });

    const hsnMap = new Map<string, any>();

    register.forEach((inv) => {
      const code = inv.hsn_sac_code || 'UNKNOWN';
      if (!hsnMap.has(code)) {
        hsnMap.set(code, {
          code,
          total_invoices: 0,
          total_value: 0,
          total_taxable: 0,
          total_tax: 0,
        });
      }
      const entry = hsnMap.get(code);
      entry.total_invoices++;
      entry.total_value += inv.total_invoice_value.toNumber();
      entry.total_taxable += inv.taxable_amount.toNumber();
      entry.total_tax += inv.total_tax.toNumber();
    });

    const summary = Array.from(hsnMap.values());

    return { success: true, summary };
  } catch (error) {
    console.error('Error getting HSN summary:', error);
    return { success: false, error: 'Failed to get HSN summary' };
  }
}

// ========================================
// Return Filing Management
// ========================================

export async function saveReturnFiling(data: {
  organizationId: string;
  return_type: string;
  filing_period: string;
  return_period_start: Date;
  return_period_end: Date;
  json_data: any;
}) {
  try {
    const filing = await prisma.gST_Return_Filing.upsert({
      where: {
        return_type_filing_period_organizationId: {
          return_type: data.return_type,
          filing_period: data.filing_period,
          organizationId: data.organizationId,
        },
      },
      create: {
        organizationId: data.organizationId,
        return_type: data.return_type,
        filing_period: data.filing_period,
        return_period_start: data.return_period_start,
        return_period_end: data.return_period_end,
        json_data: JSON.stringify(data.json_data),
        status: 'Draft',
      },
      update: {
        json_data: JSON.stringify(data.json_data),
        status: 'Draft',
      },
    });

    revalidatePath('/finance/gst-reports');
    return { success: true, filing };
  } catch (error) {
    console.error('Error saving return filing:', error);
    return { success: false, error: 'Failed to save return filing' };
  }
}

export async function getReturnFilings(
  organizationId: string,
  filters?: { return_type?: string; filing_period?: string }
) {
  try {
    const filings = await prisma.gST_Return_Filing.findMany({
      where: {
        organizationId,
        ...(filters?.return_type && { return_type: filters.return_type }),
        ...(filters?.filing_period && { filing_period: filters.filing_period }),
      },
      orderBy: { filing_period: 'desc' },
    });

    return { success: true, filings };
  } catch (error) {
    console.error('Error fetching return filings:', error);
    return { success: false, error: 'Failed to fetch filings', filings: [] };
  }
}
