import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { resolveRouteAuth } from '@/app/lib/route-auth';
import { getBillBranding } from '@/app/lib/bill-branding';

// Same reception-report audience as the collections report.
const ALLOWED_STAFF_ROLES = ['admin', 'finance', 'receptionist'];

function esc(s: any): string {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function GET(req: NextRequest) {
    try {
        const auth = await resolveRouteAuth({ allowedStaffRoles: ALLOWED_STAFF_ROLES });
        if (!auth.ok) return auth.response;
        const organizationId = auth.context.organizationId;

        const { searchParams } = req.nextUrl;
        const fromStr = searchParams.get('from');
        const toStr = searchParams.get('to');
        const printedByFilter = searchParams.get('printedBy') || undefined;

        if (!fromStr || !toStr) {
            return NextResponse.json({ error: 'from and to dates are required' }, { status: 400 });
        }

        const toDMY = (s: string) => {
            const [y, m, d] = s.split('-');
            return (y && m && d) ? `${d}-${m}-${y}` : s;
        };

        const fromDate = new Date(fromStr + 'T00:00:00+05:30');
        const toDate = new Date(toStr + 'T23:59:59.999+05:30');

        const branding = await getBillBranding(organizationId);

        const usersList = await prisma.user.findMany({
            where: { organizationId },
            select: { username: true, name: true },
        });
        const userMap = new Map(usersList.map(u => [u.username?.toLowerCase() || '', u.name || '']));

        const where: any = {
            organizationId,
            module: 'reception',
            action: 'PRINT_OPD_SLIP',
            created_at: { gte: fromDate, lte: toDate },
        };
        if (printedByFilter && printedByFilter !== 'all') {
            where.username = printedByFilter;
        }

        const logs = await prisma.system_audit_logs.findMany({
            where,
            orderBy: { created_at: 'asc' },
        });

        const istDateOpts: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' };
        const istTimeOpts: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true };

        type Row = {
            date: string;
            time: string;
            patientName: string;
            uhid: string;
            doctor: string;
            printedBy: string;
            printedByUsername: string;
        };

        const rows: Row[] = logs.map(log => {
            let details: any = {};
            try { details = log.details ? JSON.parse(log.details) : {}; } catch { /* legacy/malformed row — fall back to blanks */ }
            const username = log.username || 'unknown';
            return {
                date: log.created_at.toLocaleString('en-IN', istDateOpts),
                time: log.created_at.toLocaleString('en-IN', istTimeOpts),
                patientName: details.patient_name || '',
                uhid: log.entity_id || '',
                doctor: details.doctor || '',
                printedBy: userMap.get(username.toLowerCase()) || username,
                printedByUsername: username,
            };
        });

        // Per-day counts, in chronological order of first occurrence.
        const dayCounts = new Map<string, number>();
        rows.forEach(r => dayCounts.set(r.date, (dayCounts.get(r.date) || 0) + 1));

        const dayRowsHtml = Array.from(dayCounts.entries()).map(([date, count]) => `
            <tr>
                <td style="padding:6px;border:1px solid #ddd;">${esc(date)}</td>
                <td style="padding:6px;border:1px solid #ddd;text-align:right;font-weight:bold;">${count}</td>
            </tr>`).join('');

        const detailRowsHtml = rows.map((r, idx) => `
            <tr>
                <td style="padding:5px;border:1px solid #ddd;text-align:center;">${idx + 1}</td>
                <td style="padding:5px;border:1px solid #ddd;font-size:9px;">${esc(r.date)}<br/><span style="color:#666;">${esc(r.time)}</span></td>
                <td style="padding:5px;border:1px solid #ddd;">${esc(r.patientName)}<br/><span style="color:#666;font-size:9px;">${esc(r.uhid)}</span></td>
                <td style="padding:5px;border:1px solid #ddd;font-size:9px;">${esc(r.doctor)}</td>
                <td style="padding:5px;border:1px solid #ddd;text-align:center;font-size:9px;">${esc(r.printedBy)}<br/><span style="color:#666;">[${esc(r.printedByUsername)}]</span></td>
            </tr>`).join('');

        const printedDateStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }).replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$1-$2-$3');

        const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>OPD Slip Print Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; color: #111; background: #fff; font-size: 11px; padding: 40px; }
        @media print {
            body { padding: 20px; }
            .no-print { display: none !important; }
        }
    </style>
</head>
<body>
    <div class="no-print" style="background:#f3f4f6;padding:12px;text-align:center;margin-bottom:20px;border-radius:6px;border:1px solid #ddd;">
        <button onclick="window.print()" style="padding:8px 24px;background:#4caf50;color:white;border:none;border-radius:4px;font-weight:bold;cursor:pointer;font-size:12px;">Print / Download PDF</button>
    </div>

    <div style="text-align:center;margin-bottom:20px;line-height:1.4;">
        <h1 style="font-size:16px;font-weight:bold;text-transform:uppercase;">${esc(branding.hospitalName)}</h1>
        <p style="font-size:10px;color:#555;">${esc(branding.hospitalAddress)}</p>
    </div>

    <div style="border-top:2px solid #111;margin:10px 0;"></div>

    <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:bold;margin-bottom:15px;">
        <span>OPD Slip Print Report</span>
        <span>${toDMY(fromStr)} 00:00 AM to ${toDMY(toStr)} 11:59 PM</span>
        <span>Total Slips Printed : ${rows.length}</span>
    </div>

    <div style="border-top:1px solid #ccc;margin-bottom:20px;"></div>

    <div style="margin-bottom:30px;">
        <h2 style="font-size:12px;font-weight:bold;margin-bottom:10px;color:#333;text-transform:uppercase;border-bottom:1px solid #333;padding-bottom:3px;display:inline-block;">1. Day-wise Count</h2>
        <table style="width:300px;border-collapse:collapse;font-size:10px;margin-top:5px;border:1px solid #ddd;">
            <thead>
                <tr style="background:#f5f5f5;">
                    <th style="padding:6px;border:1px solid #ddd;text-align:left;">Date</th>
                    <th style="padding:6px;border:1px solid #ddd;text-align:right;">Slips Printed</th>
                </tr>
            </thead>
            <tbody>
                ${dayRowsHtml || '<tr><td colspan="2" style="padding:10px;text-align:center;color:#888;">No slips printed in this period.</td></tr>'}
                <tr style="background:#f9f9f9;font-weight:bold;">
                    <td style="padding:6px;border:1px solid #ddd;">Total</td>
                    <td style="padding:6px;border:1px solid #ddd;text-align:right;">${rows.length}</td>
                </tr>
            </tbody>
        </table>
    </div>

    <hr style="border:none;border-top:2px solid #333;margin:25px 0;" />

    <div style="margin-bottom:30px;">
        <h2 style="font-size:12px;font-weight:bold;margin-bottom:10px;color:#333;text-transform:uppercase;border-bottom:1px solid #333;padding-bottom:3px;display:inline-block;">2. Slip-wise Detail</h2>
        <table style="width:100%;border-collapse:collapse;font-size:10px;margin-top:5px;">
            <thead>
                <tr style="background:#fafafa;">
                    <th style="padding:5px;border:1px solid #ddd;text-align:center;width:40px;">Sr.</th>
                    <th style="padding:5px;border:1px solid #ddd;text-align:left;">Date / Time</th>
                    <th style="padding:5px;border:1px solid #ddd;text-align:left;">Patient Name / UHID</th>
                    <th style="padding:5px;border:1px solid #ddd;text-align:left;">Doctor</th>
                    <th style="padding:5px;border:1px solid #ddd;text-align:center;">Printed By</th>
                </tr>
            </thead>
            <tbody>
                ${detailRowsHtml || '<tr><td colspan="5" style="padding:10px;text-align:center;color:#888;">No slips printed in this period.</td></tr>'}
            </tbody>
        </table>
    </div>

    <div style="margin-top:40px;font-size:10px;color:#555;display:flex;justify-content:space-between;align-items:flex-end;">
        <div>
            <p>Remarks: Count reflects every time an OPD slip was opened for print; the browser print itself cannot be tracked.</p>
            <p style="margin-top:15px;">Printed By : SYSTEM &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Printed On : ${printedDateStr}</p>
        </div>
        <div style="text-align:center;width:150px;border-top:1px solid #333;padding-top:5px;font-weight:bold;">
            [Signing Authority]
        </div>
    </div>
</body>
</html>`;

        return new NextResponse(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    } catch (error: any) {
        console.error('OPD Slip Print Report Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to generate OPD Slip Print Report' }, { status: 500 });
    }
}
