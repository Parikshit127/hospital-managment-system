import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { getSession } from '@/app/lib/session';
import { getBillBranding } from '@/app/lib/bill-branding';
import { getPharmacyBranding } from '@/app/lib/pharmacy-branding';
import {
    buildPharmacyBreakupHtml,
    type BreakupSale, type BreakupLine,
} from '@/app/lib/pharmacy-patient-breakup';

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function expiryMMYYYY(d: any): string | null {
    if (!d) return null;
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return null;
    return `${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ admissionId: string }> }) {
    const { admissionId } = await params;
    const session = await getSession();
    if (!session?.organization_id) return new NextResponse('Not authorised. Please log in.', { status: 401 });
    const orgId = session.organization_id;

    // 1) Admission + patient
    const admission = await prisma.admissions.findFirst({
        where: { admission_id: admissionId, organizationId: orgId },
        select: {
            admission_id: true, patient_id: true, admission_date: true,
            admission_category: true, ward_id: true, doctor_name: true,
        },
    });
    if (!admission) return new NextResponse('Admission not found', { status: 404 });

    const [patient, ward] = await Promise.all([
        prisma.oPD_REG.findFirst({
            where: { patient_id: admission.patient_id, organizationId: orgId },
            select: { full_name: true, department: true, patient_type: true },
        }),
        admission.ward_id
            ? prisma.wards.findFirst({ where: { ward_id: admission.ward_id, organizationId: orgId }, select: { ward_name: true } })
            : Promise.resolve(null),
    ]);

    // 2) Pharmacy items are posted as invoice_items (department/service_category
    //    "Pharmacy") on the admission's invoice(s) — that is the real source of
    //    "all meds added to the patient". We group them by their shared dispensing
    //    timestamp (created_at) so each cluster prints as one "Sale", like MEDNET.
    const invoices = await prisma.invoices.findMany({
        where: { organizationId: orgId, admission_id: admissionId, status: { not: 'Cancelled' } },
        select: {
            id: true, billing_patient_type: true,
            items: {
                where: {
                    OR: [
                        { service_category: { equals: 'Pharmacy', mode: 'insensitive' } },
                        { department: { equals: 'Pharmacy', mode: 'insensitive' } },
                        { description: { startsWith: 'Pharmacy:' } },
                    ],
                },
                orderBy: { created_at: 'asc' },
            },
        },
    });

    const invoiceIds = new Set<number>();
    const pharmItems: any[] = [];
    let coveredFlag = 'N';
    for (const inv of invoices as any[]) {
        invoiceIds.add(inv.id);
        if (inv.billing_patient_type && inv.billing_patient_type !== 'cash') coveredFlag = 'Y';
        for (const it of inv.items || []) pharmItems.push(it);
    }

    // Parse "Pharmacy: <name> (Batch <batch>) × <qty> — Dr. <doctor>" → name + batch.
    const parseDesc = (d: string): { name: string; batch: string | null } => {
        const s = String(d || '');
        const nameM = s.match(/^Pharmacy:\s*(.+?)\s*(?:\(Batch\b|×|x\s|—|$)/i);
        const batchM = s.match(/\(Batch\s*([^)]*)\)/i);
        let name = nameM ? nameM[1].trim() : s.replace(/^Pharmacy:\s*/i, '').trim();
        name = name.replace(/\s*\(Batch[^)]*\)\s*$/i, '').trim();
        const batch = batchM ? (batchM[1].trim() || null) : null;
        return { name: name || s, batch: batch && !/^n\/?a$/i.test(batch) ? batch : (batchM ? batch : null) };
    };

    // Enrich expiry from batch inventory for the parsed batch numbers.
    const sales: BreakupSale[] = [];
    let purchased = 0;
    if (pharmItems.length > 0) {
        const batchNos = Array.from(new Set(
            pharmItems.map((it) => parseDesc(it.description).batch).filter((b) => b && !/^n\/?a$/i.test(b)) as string[]
        ));
        const batches = batchNos.length
            ? await prisma.pharmacy_batch_inventory.findMany({ where: { batch_no: { in: batchNos } }, select: { batch_no: true, expiry_date: true } })
            : [];
        const expiryMap = new Map<string, any>(batches.map((b: any) => [b.batch_no, b.expiry_date]));

        // Group by dispensing timestamp (minute precision).
        const groups = new Map<string, any[]>();
        for (const it of pharmItems) {
            if (/^Return:/i.test(String(it.description || ''))) continue; // ₹0 reversal lines — returns shown separately
            const key = new Date(it.created_at).toISOString().slice(0, 16);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(it);
        }
        const orderedKeys = Array.from(groups.keys()).sort();
        orderedKeys.forEach((key, idx) => {
            const items = groups.get(key)!;
            const lines: BreakupLine[] = items.map((it) => {
                const { name, batch } = parseDesc(it.description);
                const qty = Number(it.quantity) || 0;
                const rate = Number(it.unit_price) || 0;
                const amount = it.net_price != null ? Number(it.net_price) : (it.total_price != null ? Number(it.total_price) : r2(qty * rate));
                return {
                    name,
                    covered: coveredFlag,
                    expiry: batch && expiryMap.has(batch) ? expiryMMYYYY(expiryMap.get(batch)) : null,
                    batch: batch || null,
                    qty, unit: '', selling: rate, amount: r2(amount), discount: Number(it.discount) || 0,
                };
            });
            const total = r2(lines.reduce((s, l) => s + l.amount, 0));
            const totalDiscount = r2(lines.reduce((s, l) => s + l.discount, 0));
            purchased = r2(purchased + total);
            sales.push({ saleNo: `S.${idx + 1}`, isReturn: false, dateTime: items[0].created_at, lines, total, totalDiscount });
        });
    }

    // 3) Patient returns (best-effort: linked through this patient's pharmacy invoices)
    let returned = 0;
    try {
        // Include the patient's own pharmacy invoices too.
        const patientInvoices = await prisma.invoices.findMany({
            where: { organizationId: orgId, patient_id: admission.patient_id },
            select: { id: true },
        });
        patientInvoices.forEach((i: any) => invoiceIds.add(i.id));

        if (invoiceIds.size > 0) {
            const returns = await prisma.pharmacyReturn.findMany({
                where: {
                    organizationId: orgId,
                    return_type: { contains: 'patient' },
                    OR: [
                        { original_invoice_id: { in: Array.from(invoiceIds) } },
                        { invoice_id: { in: Array.from(invoiceIds) } },
                    ],
                },
                orderBy: { created_at: 'asc' },
            });
            const medIds = Array.from(new Set(returns.map((r: any) => r.medicine_id).filter(Boolean)));
            const meds = medIds.length
                ? await prisma.pharmacy_medicine_master.findMany({ where: { id: { in: medIds } }, select: { id: true, brand_name: true } })
                : [];
            const medMap = new Map<number, string>(meds.map((m: any) => [m.id, m.brand_name]));

            for (const rt of returns as any[]) {
                const qty = Number(rt.quantity) || 0;
                const rate = Number(rt.unit_cost) || 0;
                const amount = r2(qty * rate);
                returned = r2(returned + amount);
                sales.push({
                    saleNo: `SR.${rt.id}`, isReturn: true, dateTime: rt.created_at,
                    lines: [{
                        name: medMap.get(rt.medicine_id) || `#${rt.medicine_id}`,
                        covered: 'N', expiry: null, batch: rt.batch_id || null,
                        qty, unit: '', selling: rate, amount, discount: 0,
                    }],
                    total: amount, totalDiscount: 0,
                });
            }
        }
    } catch {
        // returns are best-effort — never block the breakup on them
    }

    // 4) Summary
    const netPurchased = r2(purchased - returned);
    const totalAmount = Math.round(netPurchased);
    const billRoundOff = r2(totalAmount - netPurchased);
    const isPayer = patient?.patient_type && patient.patient_type !== 'cash';

    const hospitalBranding = await getBillBranding(orgId);

    const html = buildPharmacyBreakupHtml({
        hospital: { name: hospitalBranding.hospitalName, address: hospitalBranding.hospitalAddress },
        pharmacy: getPharmacyBranding(orgId),
        patient: {
            name: patient?.full_name || admission.patient_id,
            regNo: admission.admission_id,
            department: ward?.ward_name || patient?.department || '-',
            admissionDate: admission.admission_date,
            category: admission.admission_category || (isPayer ? 'CREDIT' : 'PAYING'),
        },
        sales,
        summary: {
            purchased, returned, netPurchased,
            discount: 0, billRoundOff, totalAmount,
            companyCredit: isPayer ? totalAmount : 0,
            patientAmount: isPayer ? 0 : totalAmount,
            patientPaid: 0,
            pending: isPayer ? 0 : totalAmount,
        },
    });

    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
