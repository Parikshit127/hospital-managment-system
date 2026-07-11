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
        where.invoice_date = {};
        if (fromStr) where.invoice_date.gte = new Date(fromStr + 'T00:00:00');
        if (toStr) where.invoice_date.lte = new Date(toStr + 'T23:59:59.999');
    }

    let invoices = await prisma.pharmacyPurchaseInvoice.findMany({
        where,
        orderBy: { invoice_date: 'desc' },
        include: {
            vendor: { select: { vendor_name: true } },
            po: { select: { po_number: true } },
        },
    });

    if (search) {
        invoices = invoices.filter(inv =>
            inv.invoice_number.toLowerCase().includes(search) ||
            (inv.vendor?.vendor_name || '').toLowerCase().includes(search) ||
            (inv.po?.po_number || '').toLowerCase().includes(search)
        );
    }

    const branding = getPharmacyBranding(session.organization_id);
    const totalAmount = invoices.reduce((s, inv) => s + Number(inv.total_amount || 0), 0);
    const totalPaid = invoices.reduce((s, inv) => s + Number(inv.amount_paid || 0), 0);

    const rowsHtml = invoices.map((inv, idx) => `
        <tr>
            <td style="padding:6px;border:1px solid #ddd;text-align:center;">${idx + 1}</td>
            <td style="padding:6px;border:1px solid #ddd;font-family:monospace;">${inv.invoice_number}</td>
            <td style="padding:6px;border:1px solid #ddd;">${inv.vendor?.vendor_name || ''}</td>
            <td style="padding:6px;border:1px solid #ddd;font-family:monospace;font-size:9px;">${inv.po?.po_number || '—'}</td>
            <td style="padding:6px;border:1px solid #ddd;text-align:center;">${inv.status}</td>
            <td style="padding:6px;border:1px solid #ddd;text-align:center;">${new Date(inv.invoice_date).toLocaleDateString('en-GB')}</td>
            <td style="padding:6px;border:1px solid #ddd;text-align:right;">${Number(inv.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            <td style="padding:6px;border:1px solid #ddd;text-align:right;">${Number(inv.amount_paid || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            <td style="padding:6px;border:1px solid #ddd;text-align:right;font-weight:bold;">${(Number(inv.total_amount || 0) - Number(inv.amount_paid || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>`).join('');

    const filterSummary = [
        status ? `Status: ${status}` : null,
        fromStr ? `From: ${fromStr}` : null,
        toStr ? `To: ${toStr}` : null,
        search ? `Search: "${search}"` : null,
    ].filter(Boolean).join(' · ') || 'All purchase invoices';

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Purchase Invoices Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; color: #111; background: #fff; font-size: 11px; padding: 40px; }
        @media print { body { padding: 20px; } .no-print { display: none !important; } }
    </style>
</head>
<body>
    <div class="no-print" style="background:#f3f4f6;padding:12px;text-align:center;margin-bottom:20px;border-radius:6px;border:1px solid #ddd;">
        <button onclick="window.print()" style="padding:8px 24px;background:#4f46e5;color:white;border:none;border-radius:4px;font-weight:bold;cursor:pointer;font-size:12px;">Print / Download PDF</button>
    </div>

    <div style="text-align:center;margin-bottom:20px;line-height:1.4;">
        <h1 style="font-size:16px;font-weight:bold;text-transform:uppercase;">${branding.name}</h1>
        <p style="font-size:10px;color:#555;">${branding.address}</p>
        ${branding.gstin ? `<p style="font-size:10px;font-weight:bold;">GST NO.-${branding.gstin}</p>` : ''}
    </div>

    <div style="border-top:2px solid #111;margin:10px 0;"></div>

    <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:bold;margin-bottom:5px;">
        <span>Purchase Invoices Report</span>
        <span>Printed: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
    </div>
    <div style="font-size:10px;color:#555;margin-bottom:15px;">${filterSummary}</div>

    <div style="border-top:1px solid #ccc;margin-bottom:15px;"></div>

    <table style="width:100%;border-collapse:collapse;font-size:10px;">
        <thead>
            <tr style="background:#f5f5f5;">
                <th style="padding:6px;border:1px solid #ddd;width:35px;">Sr.</th>
                <th style="padding:6px;border:1px solid #ddd;text-align:left;">Invoice #</th>
                <th style="padding:6px;border:1px solid #ddd;text-align:left;">Vendor</th>
                <th style="padding:6px;border:1px solid #ddd;text-align:left;">PO</th>
                <th style="padding:6px;border:1px solid #ddd;">Status</th>
                <th style="padding:6px;border:1px solid #ddd;">Date</th>
                <th style="padding:6px;border:1px solid #ddd;text-align:right;">Total</th>
                <th style="padding:6px;border:1px solid #ddd;text-align:right;">Paid</th>
                <th style="padding:6px;border:1px solid #ddd;text-align:right;">Balance</th>
            </tr>
        </thead>
        <tbody>
            ${rowsHtml || '<tr><td colspan="9" style="padding:20px;text-align:center;color:#888;">No purchase invoices found</td></tr>'}
        </tbody>
        <tfoot>
            <tr style="background:#f9f9f9;font-weight:bold;">
                <td colspan="6" style="padding:6px;border:1px solid #ddd;text-align:right;">Total (${invoices.length} invoices)</td>
                <td style="padding:6px;border:1px solid #ddd;text-align:right;">${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td style="padding:6px;border:1px solid #ddd;text-align:right;">${totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td style="padding:6px;border:1px solid #ddd;text-align:right;">${(totalAmount - totalPaid).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            </tr>
        </tfoot>
    </table>
</body>
</html>`;

    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
