'use server';

import { requireRoleAndTenant } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { logAuditEvent } from '@/app/actions/audit-actions';
import { INVENTORY_PROCUREMENT_ROLES, INVENTORY_VIEW_ROLES } from '@/app/lib/inventory-roles';
import { nextDocNumber } from '@/app/lib/inventory-utils';
import { postPurchaseInvoiceToGL } from '@/app/actions/inventory-gl-actions';

const REVALIDATE = ['/inventory/procurement', '/pharmacy/purchase-orders', '/pharmacy/purchase-invoices'];

function revalidateProcurement() {
  REVALIDATE.forEach((p) => revalidatePath(p));
}

async function resolvePharmacySupplier(db: any, organizationId: string, vendorId: number) {
  const vendor = await db.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) throw new Error('Vendor not found');
  let pharmSupplier = await db.pharmacySupplier.findFirst({
    where: { organizationId, name: vendor.vendor_name },
  });
  if (!pharmSupplier) {
    pharmSupplier = await db.pharmacySupplier.create({
      data: {
        name: vendor.vendor_name,
        contact_person: vendor.contact_person || null,
        phone: vendor.phone || null,
        email: vendor.email || null,
        gst_no: vendor.gst_number || null,
        organizationId,
      },
    });
  }
  return { vendor, pharmSupplier };
}

export async function createItemPurchaseOrder(data: {
  vendor_id: number;
  store_id: number;
  pr_id?: number;
  notes?: string;
  lines: Array<{
    item_id: number;
    quantity: number;
    unit_price: number;
    gst_rate?: number;
    uom?: string;
    conversion_to_base?: number;
  }>;
}) {
  try {
    const { db, session, organizationId } = await requireRoleAndTenant([...INVENTORY_PROCUREMENT_ROLES]);
    const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

    const { pharmSupplier } = await resolvePharmacySupplier(db, organizationId, data.vendor_id);

    let totalAmount = 0;
    let gstAmount = 0;
    const linePayloads = [];

    for (const line of data.lines) {
      const item = await db.item_master.findFirst({ where: { id: line.item_id } });
      if (!item) throw new Error(`Item ${line.item_id} not found`);
      const gstRate = line.gst_rate ?? item.gst_rate ?? 0;
      const taxable = r2(line.quantity * line.unit_price);
      const gst = r2(taxable * gstRate / 100);
      const amount = r2(taxable + gst);
      totalAmount += amount;
      gstAmount += gst;
      linePayloads.push({
        itemMasterId: line.item_id,
        medicine_id: null,
        quantity_ordered: line.quantity,
        unit_price: line.unit_price,
        gst_rate: gstRate,
        cgst_rate: gstRate / 2,
        sgst_rate: gstRate / 2,
        hsn_code: item.hsn_sac_code,
        amount,
        uom: line.uom || item.purchase_uom,
        conversion_to_base: line.conversion_to_base ?? item.uom_conversion ?? 1,
      });
    }

    const poNum = `PO-${Date.now().toString().slice(-8)}`;

    const po = await db.purchaseOrder.create({
      data: {
        po_number: poNum,
        supplier_id: pharmSupplier.id,
        vendor_id: data.vendor_id,
        storeId: data.store_id,
        purchaseRequisitionId: data.pr_id || null,
        status: 'Draft',
        total_amount: r2(totalAmount),
        gst_amount: r2(gstAmount),
        notes: data.notes,
        organizationId,
        items: { create: linePayloads },
      },
      include: { items: true },
    });

    await logAuditEvent({
      userId: session.id,
      username: session.username,
      role: session.role,
      action: 'CREATE',
      module: 'inventory',
      entityType: 'PO',
      entityId: String(po.id),
      details: `Created item PO ${po.po_number}`,
    });
    revalidateProcurement();
    return { success: true, data: po };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function convertPRtoPO(prId: number, vendorId: number) {
  try {
    const { db } = await requireRoleAndTenant([...INVENTORY_PROCUREMENT_ROLES]);
    const pr = await db.purchase_requisitions.findFirst({
      where: { id: prId },
      include: { purchase_requisition_items: true },
    });
    if (!pr) return { success: false, error: 'PR not found' };
    if (pr.status !== 'Approved') return { success: false, error: 'PR must be approved' };

    const lines = pr.purchase_requisition_items.map((l: any) => ({
      item_id: l.item_id,
      quantity: l.quantity,
      unit_price: 0,
    }));

    for (const line of lines) {
      const item = await db.item_master.findFirst({ where: { id: line.item_id } });
      line.unit_price = item?.std_purchase_price || 0;
    }

    const poRes = await createItemPurchaseOrder({
      vendor_id: vendorId,
      store_id: pr.requesting_store_id,
      pr_id: prId,
      lines,
    });

    if (poRes.success) {
      await db.purchase_requisitions.update({
        where: { id: prId },
        data: { status: 'Converted', updated_at: new Date() },
      });
    }
    return poRes;
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function submitItemPO(poId: number) {
  try {
    const { db, session } = await requireRoleAndTenant([...INVENTORY_PROCUREMENT_ROLES]);
    const po = await db.purchaseOrder.findFirst({ where: { id: poId }, include: { items: true } });
    if (!po) return { success: false, error: 'PO not found' };

    const config = await db.moduleConfig.findFirst({ where: { module_key: 'inventory' } });
    const settings = (config?.config_json as any) || {};
    const autoBelow = settings.po_auto_approve_below ?? 50000;

    const status = po.total_amount <= autoBelow ? 'Approved' : 'Submitted';
    const updated = await db.purchaseOrder.update({
      where: { id: poId },
      data: {
        status,
        ordered_at: new Date(),
        approved_at: status === 'Approved' ? new Date() : null,
        approved_by: status === 'Approved' ? session.username : null,
      },
    });
    revalidateProcurement();
    return { success: true, data: updated };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function approveItemPO(poId: number) {
  try {
    const { db, session } = await requireRoleAndTenant(['admin', 'store_manager', 'finance']);
    const po = await db.purchaseOrder.update({
      where: { id: poId },
      data: { status: 'Approved', approved_at: new Date(), approved_by: session.username },
    });
    revalidateProcurement();
    return { success: true, data: po };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function listItemPOs(limit = 50) {
  try {
    const { db } = await requireRoleAndTenant([...INVENTORY_VIEW_ROLES]);
    const rows = await db.purchaseOrder.findMany({
      where: { items: { some: { itemMasterId: { not: null } } } },
      include: {
        items: { include: { item_master: { select: { item_code: true, name: true } } } },
        stores: { select: { name: true } },
        vendor: { select: { vendor_name: true } },
      },
      orderBy: { created_at: 'desc' },
      take: limit,
    });
    return { success: true, data: rows };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function createItemPurchaseInvoice(data: {
  vendor_id: number;
  po_id?: number;
  invoice_number: string;
  invoice_date: string;
  lines: Array<{
    item_id: number;
    po_item_id?: number;
    grn_id?: number;
    quantity: number;
    unit_price: number;
    gst_rate: number;
    hsn_code?: string;
  }>;
}) {
  try {
    const { db, organizationId } = await requireRoleAndTenant([...INVENTORY_PROCUREMENT_ROLES]);
    const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

    const lines = data.lines.map((line) => {
      const taxable = r2(line.quantity * line.unit_price);
      const gstAmt = r2(taxable * line.gst_rate / 100);
      return {
        itemMasterId: line.item_id,
        medicine_id: null,
        grn_id: line.grn_id || null,
        po_item_id: line.po_item_id || null,
        quantity: line.quantity,
        unit_price: line.unit_price,
        gst_rate: line.gst_rate,
        cgst_amount: r2(gstAmt / 2),
        sgst_amount: r2(gstAmt / 2),
        igst_amount: 0,
        line_total: r2(taxable + gstAmt),
        hsn_code: line.hsn_code || null,
      };
    });

    const subtotal = r2(lines.reduce((s, l) => s + l.quantity * l.unit_price, 0));
    const totalAmount = r2(lines.reduce((s, l) => s + l.line_total, 0));

    const invoice = await db.pharmacyPurchaseInvoice.create({
      data: {
        organizationId,
        invoice_number: data.invoice_number,
        vendor_id: data.vendor_id,
        po_id: data.po_id || null,
        invoice_date: new Date(data.invoice_date),
        subtotal,
        cgst_amount: r2(lines.reduce((s, l) => s + l.cgst_amount, 0)),
        sgst_amount: r2(lines.reduce((s, l) => s + l.sgst_amount, 0)),
        igst_amount: 0,
        total_amount: totalAmount,
        status: 'Draft',
        line_items: { create: lines },
      },
    });

    revalidateProcurement();
    return { success: true, data: invoice };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function matchItemPurchaseInvoice(invoiceId: number) {
  try {
    const { db } = await requireRoleAndTenant([...INVENTORY_PROCUREMENT_ROLES, 'finance']);
    const invoice = await db.pharmacyPurchaseInvoice.findFirst({
      where: { id: invoiceId },
      include: {
        line_items: true,
        po: { include: { items: true, grns: { include: { goods_receipt_note_items: true } } } },
      },
    });
    if (!invoice) return { success: false, error: 'Invoice not found' };

    const config = await db.moduleConfig.findFirst({ where: { module_key: 'inventory' } });
    const tolerance = (config?.config_json as any)?.matching_tolerance_pct ?? 5;

    let allOk = true;
    const variances: any[] = [];

    for (const line of invoice.line_items) {
      const poItem = invoice.po?.items.find((pi: any) => pi.id === line.po_item_id);
      const grnQty = poItem?.quantity_received ?? null;
      const v: any = { item_id: line.itemMasterId, invoice_qty: line.quantity, grn_qty: grnQty, po_qty: poItem?.quantity_ordered };

      if (grnQty != null && line.quantity !== grnQty) {
        const pct = grnQty > 0 ? (Math.abs(line.quantity - grnQty) / grnQty) * 100 : 100;
        v.qty_variance_pct = pct;
        if (pct > tolerance) allOk = false;
      }
      if (poItem && Math.abs(line.unit_price - poItem.unit_price) / poItem.unit_price * 100 > tolerance) {
        allOk = false;
        v.price_variance = line.unit_price - poItem.unit_price;
      }
      variances.push(v);
    }

    const status = allOk ? 'Matched' : 'Variance';
    await db.pharmacyPurchaseInvoice.update({
      where: { id: invoiceId },
      data: {
        status,
        variance_approved: allOk,
        matched_at: allOk ? new Date() : null,
      },
    });

    return { success: true, data: { status, variances, allOk } };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function postItemPurchaseInvoice(invoiceId: number) {
  try {
    const { db } = await requireRoleAndTenant(['admin', 'finance', 'procurement_officer']);
    const invoice = await db.pharmacyPurchaseInvoice.findFirst({ where: { id: invoiceId } });
    if (!invoice) return { success: false, error: 'Invoice not found' };
    if (!invoice.variance_approved && invoice.status === 'Variance') {
      return { success: false, error: 'Finance variance approval required' };
    }

    const glRes = await postPurchaseInvoiceToGL(invoiceId);
    if (!glRes.success) return glRes;

    await db.pharmacyPurchaseInvoice.update({
      where: { id: invoiceId },
      data: { status: 'Posted', posted_at: new Date() },
    });
    revalidateProcurement();
    return { success: true, data: (glRes as any).journal };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function approveInvoiceVariance(invoiceId: number) {
  try {
    const { db, session } = await requireRoleAndTenant(['admin', 'finance']);
    await db.pharmacyPurchaseInvoice.update({
      where: { id: invoiceId },
      data: { variance_approved: true, variance_approved_by: session.username },
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
