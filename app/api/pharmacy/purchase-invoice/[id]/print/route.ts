import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { getSession } from '@/app/lib/session';
import { getPharmacyBranding } from '@/app/lib/pharmacy-branding';
import { buildPurchasePrintHtml, type PurchasePrintLine } from '@/app/lib/purchase-print';

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const invId = parseInt(id, 10);
    if (isNaN(invId)) return NextResponse.json({ error: 'Invalid invoice id' }, { status: 400 });

    const session = await getSession();
    if (!session?.organization_id) return new NextResponse('Not authorised. Please log in.', { status: 401 });

    const inv = await prisma.pharmacyPurchaseInvoice.findFirst({
        where: { id: invId, organizationId: session.organization_id },
        include: {
            line_items: { include: { medicine: { select: { brand_name: true } } } },
            vendor: { select: { vendor_name: true, gst_number: true, address: true, phone: true } },
        },
    });
    if (!inv) return new NextResponse('Purchase invoice not found', { status: 404 });

    // PI lines don't store batch/expiry/mrp/pack — enrich from the linked PO item.
    const poItemIds = inv.line_items.map((l: any) => l.po_item_id).filter(Boolean);
    const poItems = poItemIds.length
        ? await prisma.purchaseOrderItem.findMany({ where: { id: { in: poItemIds } } })
        : [];
    const poItemMap = new Map<number, any>(poItems.map((p: any) => [p.id, p]));

    const lines: PurchasePrintLine[] = inv.line_items.map((l: any) => {
        const qty = Number(l.quantity) || 0;
        const rate = Number(l.unit_price) || 0;
        const cgst = Number(l.cgst_amount) || 0;
        const sgst = Number(l.sgst_amount) || 0;
        const igst = Number(l.igst_amount) || 0;
        const amount = Number(l.line_total) || 0;
        const taxable = r2(amount - cgst - sgst - igst);
        const poi = l.po_item_id ? poItemMap.get(l.po_item_id) : null;
        return {
            name: l.medicine?.brand_name || `#${l.medicine_id}`,
            pack: l.pack || poi?.pack || null,
            hsn: l.hsn_code || poi?.hsn_code || null,
            batch: l.batch_no || poi?.batch_no || null,
            expiry: l.expiry || poi?.expiry || null,
            mrp: l.mrp != null ? Number(l.mrp) : (poi?.mrp != null ? Number(poi.mrp) : 0),
            qty,
            rate,
            disPct: Number(l.discount_pct) || 0,
            gstPct: Number(l.gst_rate) || 0,
            taxable,
            cgst,
            sgst,
            igst,
            amount,
        };
    });

    const html = buildPurchasePrintHtml({
        kind: 'PURCHASE INVOICE',
        docNumber: inv.invoice_number,
        docDate: inv.invoice_date,
        dueDate: inv.due_date,
        status: inv.status,
        notes: inv.matching_notes,
        buyer: getPharmacyBranding(session.organization_id),
        supplier: {
            name: inv.vendor?.vendor_name || `Vendor #${inv.vendor_id}`,
            gstin: inv.vendor_gstin || inv.vendor?.gst_number || null,
            address: inv.vendor?.address || null,
            phone: inv.vendor?.phone || null,
        },
        lines,
    });

    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
