import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { getSession } from '@/app/lib/session';
import { getPharmacyBranding } from '@/app/lib/pharmacy-branding';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session?.organization_id) return new NextResponse('Not authorised. Please log in.', { status: 401 });

    const { searchParams } = req.nextUrl;
    const search = (searchParams.get('search') || '').trim().toLowerCase();
    const status = searchParams.get('status') || '';
    const fromStr = searchParams.get('from');
    const toStr = searchParams.get('to');

    const where: any = { organizationId: session.organization_id };
    if (status) where.status = status;
    if (fromStr || toStr) {
        where.created_at = {};
        if (fromStr) where.created_at.gte = new Date(fromStr + 'T00:00:00');
        if (toStr) where.created_at.lte = new Date(toStr + 'T23:59:59.999');
    }

    let orders = await prisma.purchaseOrder.findMany({
        where,
        orderBy: { created_at: 'desc' },
        include: {
            supplier: true,
            vendor: { select: { vendor_name: true } },
            items: { select: { id: true } },
        },
    });

    if (search) {
        orders = orders.filter(po =>
            po.po_number.toLowerCase().includes(search) ||
            (po.supplier?.name || po.vendor?.vendor_name || '').toLowerCase().includes(search)
        );
    }

    const branding = getPharmacyBranding(session.organization_id);
    const totalAmount = orders.reduce((s, po) => s + Number(po.total_amount || 0), 0);

    const rowsHtml = orders.map((po, idx) => `
        <tr>
            <td style="padding:6px;border:1px solid #ddd;text-align:center;">${idx + 1}</td>
            <td style="padding:6px;border:1px solid #ddd;font-family:monospace;">${po.po_number}</td>
            <td style="padding:6px;border:1px solid #ddd;">${po.supplier?.name || po.vendor?.vendor_name || `Vendor #${po.supplier_id}`}</td>
            <td style="padding:6px;border:1px solid #ddd;text-align:center;">${po.items.length}</td>
            <td style="padding:6px;border:1px solid #ddd;text-align:center;">${po.status}</td>
            <td style="padding:6px;border:1px solid #ddd;text-align:center;">${new Date(po.created_at).toLocaleDateString('en-GB')}</td>
            <td style="padding:6px;border:1px solid #ddd;text-align:right;font-weight:bold;">${Number(po.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>`).join('');

    const filterSummary = [
        status ? `Status: ${status}` : null,
        fromStr ? `From: ${fromStr}` : null,
        toStr ? `To: ${toStr}` : null,
        search ? `Search: "${search}"` : null,
    ].filter(Boolean).join(' · ') || 'All purchase orders';

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Purchase Orders Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; color: #111; background: #fff; font-size: 11px; padding: 40px; }
        @media print { body { padding: 20px; } .no-print { display: none !important; } }
    </style>
</head>
<body>
    <div class="no-print" style="background:#f3f4f6;padding:12px;text-align:center;margin-bottom:20px;border-radius:6px;border:1px solid #ddd;">
        <button onclick="window.print()" style="padding:8px 24px;background:#0d9488;color:white;border:none;border-radius:4px;font-weight:bold;cursor:pointer;font-size:12px;">Print / Download PDF</button>
    </div>

    <div style="text-align:center;margin-bottom:20px;line-height:1.4;">
        <h1 style="font-size:16px;font-weight:bold;text-transform:uppercase;">${branding.name}</h1>
        <p style="font-size:10px;color:#555;">${branding.address}</p>
        ${branding.gstin ? `<p style="font-size:10px;font-weight:bold;">GST NO.-${branding.gstin}</p>` : ''}
    </div>

    <div style="border-top:2px solid #111;margin:10px 0;"></div>

    <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:bold;margin-bottom:5px;">
        <span>Purchase Orders Report</span>
        <span>Printed: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
    </div>
    <div style="font-size:10px;color:#555;margin-bottom:15px;">${filterSummary}</div>

    <div style="border-top:1px solid #ccc;margin-bottom:15px;"></div>

    <table style="width:100%;border-collapse:collapse;font-size:10px;">
        <thead>
            <tr style="background:#f5f5f5;">
                <th style="padding:6px;border:1px solid #ddd;width:35px;">Sr.</th>
                <th style="padding:6px;border:1px solid #ddd;text-align:left;">PO Number</th>
                <th style="padding:6px;border:1px solid #ddd;text-align:left;">Supplier</th>
                <th style="padding:6px;border:1px solid #ddd;">Items</th>
                <th style="padding:6px;border:1px solid #ddd;">Status</th>
                <th style="padding:6px;border:1px solid #ddd;">Date</th>
                <th style="padding:6px;border:1px solid #ddd;text-align:right;">Total Amount</th>
            </tr>
        </thead>
        <tbody>
            ${rowsHtml || '<tr><td colspan="7" style="padding:20px;text-align:center;color:#888;">No purchase orders found</td></tr>'}
        </tbody>
        <tfoot>
            <tr style="background:#f9f9f9;font-weight:bold;">
                <td colspan="6" style="padding:6px;border:1px solid #ddd;text-align:right;">Total (${orders.length} orders)</td>
                <td style="padding:6px;border:1px solid #ddd;text-align:right;">${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            </tr>
        </tfoot>
    </table>
</body>
</html>`;

    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
