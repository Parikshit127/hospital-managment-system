// Run: npx tsx scripts/test-pharmacy-gst-report.ts - stubbed-DB checks of the pharmacy GST report maths (no DB access).
const Module = require('module');
const orig = Module._load;
const D = (s: string) => new Date(s);
const meds = [
  { id: 1, brand_name: 'PARA', gst_percent: 12, tax_rate: 0, hsn_sac_code: '3004', is_active: true },
  { id: 2, brand_name: 'VIT', gst_percent: 5, tax_rate: 0, hsn_sac_code: '30045090', is_active: true },
];
const mk = (no: string, status: string, items: any[], extra: any = {}) => ({ id: Math.random(), invoice_number: no, status, patient_id: 'WALKIN', created_at: D('2026-09-10T10:00:00Z'),
  total_tax: 17, bill_discount: 0, total_discount: 0, is_inter_state: false, items, ...extra });
const line = (d: string, q: number, up: number, rate: number, mrp = 0) => ({ description: `${d} (Batch: B1)`, quantity: q, unit_price: up, discount: 0, net_price: q * up, tax_rate: rate, tax_amount: q * up * rate / 100, hsn_sac_code: null, mrp });
const invoices = [
  mk('T-PHM-001', 'Final', [line('PARA', 10, 10, 12), line('VIT', 5, 20, 5)], { bill_discount: 21.7 }),
  mk('T-PHM-002', 'Cancelled', [line('PARA', 1, 10, 12)]),
  mk('T-PHM-004', 'Final', [line('PARA', 1, 10, 12, 10)]),  // gap at 003; priced at MRP before tax
];
const pl = (mid: number, q: number, up: number, rate: number, c: number, s: number, i = 0) => ({ medicine_id: mid, quantity: q, unit_price: up, gst_rate: rate, cgst_amount: c, sgst_amount: s, igst_amount: i, discount_pct: 0, discount_amount: 0, scheme_amount: 0 });
const pis = [
  { invoice_number: 'P1', status: 'Posted', invoice_date: D('2026-09-05'), vendor_gstin: '06AKIPA3324R1Z2', cgst_amount: 30, sgst_amount: 30, igst_amount: 0, vendor: { vendor_name: 'Local', gst_number: null }, line_items: [pl(1, 10, 50, 12, 30, 30)] },
  { invoice_number: 'P2', status: 'Paid', invoice_date: D('2026-09-06'), vendor_gstin: '08AAMCM7063J1ZY', cgst_amount: 25, sgst_amount: 25, igst_amount: 0, vendor: { vendor_name: 'Raj', gst_number: null }, line_items: [pl(2, 100, 10, 5, 25, 25)] },
  { invoice_number: 'P3', status: 'Posted', invoice_date: D('2026-09-07'), vendor_gstin: '', cgst_amount: 9, sgst_amount: 9, igst_amount: 0, vendor: { vendor_name: 'NoGstin', gst_number: null }, line_items: [pl(1, 10, 150, 12, 9, 9)] },
  { invoice_number: 'P4', status: 'Draft', invoice_date: D('2026-09-08'), vendor_gstin: '06AKIPA3324R1Z2', cgst_amount: 6, sgst_amount: 6, igst_amount: 0, vendor: { vendor_name: 'Local', gst_number: null }, line_items: [pl(1, 1, 100, 12, 6, 6)] },
];
const tables: Record<string, any> = {
  pharmacy_medicine_master: { findMany: async () => meds },
  creditNote: { findMany: async () => [{ credit_note_number: 'CN1', status: 'Draft', total_amount: 22.4, reason: 'ret', created_at: D('2026-09-12T10:00:00Z'), original_invoice: { invoice_number: 'T-PHM-001' }, items: JSON.stringify([{ medicine_id: 1, quantity: 2, amount: 22.4 }]) }] },
  pharmacyPurchaseInvoice: { findMany: async () => pis },
  pharmacyReturn: { findMany: async () => [{ return_type: 'expired_stock', medicine_id: 1, batch_id: 'B1', quantity: 10, unit_cost: 5, vendor_id: null, created_at: D('2026-09-15T10:00:00Z') }], count: async () => 0 },
};
const db = new Proxy({}, { get: (_t, k: string) => tables[k] || new Proxy({}, { get: (_t2, op: string) => async () => (op === 'count' ? 0 : []) }) });
Module._load = function (req: string, ...rest: any[]) {
  if (req === '@/backend/tenant') return { requireTenantContext: async () => ({ db, session: {}, organizationId: '0425857b-6293-4d91-86b2-bd049de66252' }) };
  if (req === '@/backend/db') return { prisma: { invoices: { findMany: async (a: any) => (a.select?.items ? invoices : invoices.map((i) => ({ invoice_number: i.invoice_number }))) } } };
  if (req === '@/app/lib/pharmacy-access') return { denyUnlessPharmacyRole: async () => null, PHARMACY_OPERATE_ROLES: [] };
  return orig.call(this, req, ...rest);
};
const eq = (label: string, got: any, want: any) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); if (!ok) process.exitCode = 1; };
(async () => {
  const { getPharmacyGstReport } = require('../app/actions/pharmacy-gst-actions');
  const r = await getPharmacyGstReport({ from: '2026-09-01', to: '2026-09-30' });
  if (!r.success) { console.log('ERR', r.error); process.exit(1); }
  const x = r.report;
  const pick = (rows: any[], rate: number) => rows.find((r) => r.rate === rate);
  // INV-001: gross 217, disc 21.7 -> factor .9. PARA 90/10.8, VIT 90/4.5. INV-004 adds PARA 10/1.2
  eq('sales 12% taxable', pick(x.sales.byRate, 12).taxable, 100);
  eq('sales 12% cgst', pick(x.sales.byRate, 12).cgst, 6);
  eq('sales 5% taxable/tax', [pick(x.sales.byRate, 5).taxable, pick(x.sales.byRate, 5).tax], [90, 4.5]);
  eq('CN 12% (22.4 incl -> 20 + 2.4)', [pick(x.sales.creditNotes.byRate, 12).taxable, pick(x.sales.creditNotes.byRate, 12).tax], [20, 2.4]);
  eq('net 12% taxable/tax', [pick(x.sales.net.byRate, 12).taxable, pick(x.sales.net.byRate, 12).tax], [80, 9.6]);
  eq('3.1(a) taxable', x.gstr3b.t31a.taxable, 170);
  eq('3.1(a) cgst = (9.6+4.5)/2', x.gstr3b.t31a.cgst, 7.05);
  eq('docs: issued/cancelled', [x.sales.documents.issued, x.sales.documents.cancelled], [3, 1]);
  eq('docs: gap detected', x.sales.documents.series[0].missing, ['T-PHM-003']);
  eq('HSN rows (3004@12 & 30045090@5)', x.sales.hsn.map((h: any) => `${h.hsn}@${h.rate}:${h.qty}`), ['3004@12:9', '30045090@5:5']);
  // ITC: P1 intra 30/30; P2 Rajasthan -> IGST 50; P3 no GSTIN -> at risk 18; P4 draft excluded
  eq('ITC heads (P1 + P2 reclass)', x.purchases.itc, { cgst: 30, sgst: 30, igst: 50, total: 110 });
  eq('ITC at risk', x.purchases.itcAtRisk, 18);
  eq('draft purchase not counted', x.purchases.notPosted, { count: 1, tax: 12 });
  // write-off: 10 * 5 = 50 taxable @12 = 6 -> 3/3
  eq('4(B)(1) write-off', x.gstr3b.t4B1, { cgst: 3, sgst: 3, igst: 0 });
  eq('net ITC', x.gstr3b.netItc, { cgst: 27, sgst: 27, igst: 50 });
  // Rule 88A: IGST credit 50 pays CGST 7.05 then SGST 7.05 -> igst left 35.9
  eq('cash payable', x.gstr3b.cashPayable, { cgst: 0, sgst: 0, igst: 0 });
  eq('carry forward', x.gstr3b.carryForward, { cgst: 27, sgst: 27, igst: 35.9 });
  const codes = x.issues.map((i: any) => i.code);
  for (const c of ['SALES_TAX_ON_TOP_OF_MRP', 'CN_DRAFT', 'PURCHASE_GSTIN_INVALID', 'PURCHASE_TAX_HEAD', 'PURCHASE_NOT_POSTED', 'DOC_GAPS', 'ITC_REVERSAL_ESTIMATED'])
    eq(`issue raised: ${c}`, codes.includes(c), true);
  process.exit(process.exitCode || 0);
})();
