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

    // 2) All pharmacy dispenses (sales) for this admission, with batch/expiry
    const orders = await prisma.pharmacy_orders.findMany({
        where: { organizationId: orgId, admission_id: admissionId },
        include: {
            items: {
                include: {
                    medicine: { select: { brand_name: true } },
                    dispense_allocations: { include: { batch: { select: { batch_no: true, expiry_date: true } } } },
                },
            },
            invoice: { select: { billing_patient_type: true } },
        },
        orderBy: { created_at: 'asc' },
    });

    const sales: BreakupSale[] = [];
    let purchased = 0;
    const invoiceIds = new Set<number>();

    for (const o of orders as any[]) {
        if (o.invoice_id) invoiceIds.add(o.invoice_id);
        const covered = (o.invoice?.billing_patient_type && o.invoice.billing_patient_type !== 'cash') ? 'Y' : 'N';
        const lines: BreakupLine[] = [];

        for (const it of o.items || []) {
            const rate = Number(it.unit_price) || 0;
            const allocs = it.dispense_allocations || [];
            if (allocs.length > 0) {
                for (const a of allocs) {
                    const qty = Number(a.quantity) || 0;
                    lines.push({
                        name: it.medicine?.brand_name || it.medicine_name || `#${it.medicine_id}`,
                        covered,
                        expiry: expiryMMYYYY(a.batch?.expiry_date),
                        batch: a.batch?.batch_no || it.batch_id || null,
                        qty, unit: '', selling: rate, amount: r2(qty * rate), discount: 0,
                    });
                }
            } else {
                const qty = Number(it.quantity_dispensed ?? it.quantity_requested) || 0;
                const amt = it.total_price != null ? Number(it.total_price) : r2(qty * rate);
                lines.push({
                    name: it.medicine?.brand_name || it.medicine_name || `#${it.medicine_id}`,
                    covered, expiry: null, batch: it.batch_id || null,
                    qty, unit: '', selling: rate, amount: r2(amt), discount: 0,
                });
            }
        }
        if (lines.length === 0) continue;
        const total = r2(lines.reduce((s, l) => s + l.amount, 0));
        purchased = r2(purchased + total);
        sales.push({ saleNo: `S.${o.id}`, isReturn: false, dateTime: o.created_at, lines, total, totalDiscount: 0 });
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
