import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { getSession } from '@/app/lib/session';
import { getPharmacyBranding } from '@/app/lib/pharmacy-branding';
import { buildPurchasePrintHtml, type PurchasePrintLine } from '@/app/lib/purchase-print';

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const poId = parseInt(id, 10);
    if (isNaN(poId)) return NextResponse.json({ error: 'Invalid PO id' }, { status: 400 });

    const session = await getSession();
    if (!session?.organization_id) return new NextResponse('Not authorised. Please log in.', { status: 401 });

    const po = await prisma.purchaseOrder.findFirst({
        where: { id: poId, organizationId: session.organization_id },
        include: {
            items: { include: { medicine: { select: { brand_name: true } } } },
            supplier: true,
            vendor: { select: { vendor_name: true, gst_number: true, address: true, phone: true } },
        },
    });
    if (!po) return new NextResponse('Purchase order not found', { status: 404 });

    const lines: PurchasePrintLine[] = po.items.map((it: any) => {
        const qty = Number(it.quantity_ordered) || 0;
        const rate = Number(it.unit_price) || 0;
        const disc = Number(it.discount_pct) || 0;
        const cgstRate = it.cgst_rate != null ? Number(it.cgst_rate) : Number(it.gst_rate || 0) / 2;
        const sgstRate = it.sgst_rate != null ? Number(it.sgst_rate) : Number(it.gst_rate || 0) / 2;
        const taxable = r2(qty * rate * (1 - disc / 100));
        const cgst = r2(taxable * cgstRate / 100);
        const sgst = r2(taxable * sgstRate / 100);
        return {
            name: it.medicine?.brand_name || `#${it.medicine_id}`,
            pack: it.pack,
            hsn: it.hsn_code,
            batch: it.batch_no,
            expiry: it.expiry,
            mrp: Number(it.mrp) || 0,
            qty,
            rate,
            disPct: disc,
            gstPct: Number(it.gst_rate || cgstRate + sgstRate),
            taxable,
            cgst,
            sgst,
            igst: 0,
            amount: Number(it.amount) || r2(taxable + cgst + sgst),
        };
    });

    const supplierName = po.supplier?.name || po.vendor?.vendor_name || `Vendor #${po.supplier_id}`;
    const html = buildPurchasePrintHtml({
        kind: 'PURCHASE ORDER',
        docNumber: po.po_number,
        docDate: po.created_at,
        status: po.status,
        notes: po.notes,
        buyer: getPharmacyBranding(session.organization_id),
        supplier: {
            name: supplierName,
            gstin: po.vendor?.gst_number || po.supplier?.gst_no || null,
            address: po.vendor?.address || null,
            phone: po.vendor?.phone || po.supplier?.phone || null,
        },
        lines,
    });

    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
