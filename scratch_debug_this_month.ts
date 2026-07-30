import { prisma } from './backend/db';
import { dispensingKey } from './app/lib/pharmacy-bill-group';

const isPharmItem = (it: any) => {
    const cat = String(it.service_category || '').toLowerCase();
    const dept = String(it.department || '').toLowerCase();
    const desc = String(it.description || '').toLowerCase();
    return cat === 'pharmacy' || dept === 'pharmacy' || desc.startsWith('pharmacy:');
};

const grossOf = (items: any[]) => items.reduce((s: number, it: any) =>
    s + Number(it.net_price || 0) + Number(it.tax_amount || 0), 0);

function getPresetRange(preset: string): { from: Date; to: Date } {
    const now = new Date('2026-07-31T00:00:00+05:30'); // current time context
    const from = new Date(now); from.setDate(1); from.setHours(0, 0, 0, 0);
    const to = new Date(now); to.setHours(23, 59, 59, 999);
    return { from, to };
}

async function debugThisMonthInvoices() {
    const limit = 1000;

    // 1. OPD Pharmacy
    const opdPharmInvoices = await prisma.invoices.findMany({
        where: { invoice_type: 'Pharmacy' },
        include: {
            patient: { select: { full_name: true, phone: true } },
            items: true,
        },
        orderBy: { created_at: 'desc' },
        take: limit,
    });

    // 2. IPD Pharmacy
    const ipdPharmWhere: any = {
        invoice_type: 'IPD',
        items: {
            some: {
                OR: [
                    { service_category: { equals: 'Pharmacy', mode: 'insensitive' } },
                    { department: { equals: 'Pharmacy', mode: 'insensitive' } },
                    { description: { startsWith: 'Pharmacy:' } },
                ]
            }
        },
    };

    const ipdPharmInvoices = await prisma.invoices.findMany({
        where: ipdPharmWhere,
        include: {
            patient: { select: { full_name: true, phone: true } },
            items: true,
            admission: { select: { status: true, admission_id: true, patient: { select: { full_name: true, phone: true } } } },
        },
        orderBy: { created_at: 'desc' },
        take: limit,
    });

    const ipdPharmBills: any[] = [];
    for (const inv of ipdPharmInvoices) {
        const allItems: any[] = inv.items || [];
        const pharmItems = allItems.filter(isPharmItem);
        if (pharmItems.length === 0) continue;

        const billMap = new Map<string, any[]>();
        for (const it of pharmItems) {
            const key = dispensingKey(it.created_at);
            if (!billMap.has(key)) billMap.set(key, []);
            billMap.get(key)!.push(it);
        }

        const totalPharmGross = grossOf(pharmItems);
        const totalIpdNet = Number(inv.net_amount || 0);

        const pharmOutstanding = totalIpdNet > 0
            ? Math.max(0, Math.min(totalPharmGross, (totalPharmGross / totalIpdNet) * Number(inv.balance_due || 0)))
            : (inv.status === 'Final' ? 0 : totalPharmGross);

        let paidPharm = totalPharmGross - pharmOutstanding;

        const bills = Array.from(billMap.entries())
            .map(([key, items]) => ({
                key,
                items,
                billDate: new Date(Math.max(...items.map((it: any) => new Date(it.created_at).getTime()))),
                gross: grossOf(items),
            }))
            .sort((a, b) => a.billDate.getTime() - b.billDate.getTime());

        for (const b of bills) {
            const cover = Math.min(paidPharm, b.gross);
            paidPharm -= cover;
            ipdPharmBills.push({
                ...inv,
                _isIpdPharmacy: true,
                _pharmTotal: b.gross,
                _pharmBalance: Math.max(0, b.gross - cover),
                _pharmDate: b.billDate,
                _pharmItemCount: b.items.length,
                _billKey: b.key,
                _admissionStatus: inv.admission?.status || null,
                _admPatient: inv.admission?.patient || null,
                items: undefined,
            });
        }
    }

    // 3. Package consumed
    const pkgConsumedPostings = await prisma.ipdChargePosting.findMany({
        where: { source_module: 'pharmacy', disposition: 'package_consumed' },
        orderBy: { posted_at: 'desc' },
        take: limit,
    });
    const consumedByAdmission = new Map<string, any[]>();
    for (const p of pkgConsumedPostings) {
        const key = p.admission_id;
        if (!consumedByAdmission.has(key)) consumedByAdmission.set(key, []);
        consumedByAdmission.get(key)!.push(p);
    }
    const pkgPharmBills: any[] = [];
    if (consumedByAdmission.size > 0) {
        const admissionIds = Array.from(consumedByAdmission.keys());
        const admissions = await prisma.admissions.findMany({
            where: { admission_id: { in: admissionIds } },
            select: { admission_id: true, patient_id: true, status: true },
        });
        const admMap = new Map<string, any>(admissions.map((a: any) => [a.admission_id, a]));
        const pIds = Array.from(new Set(admissions.map((a: any) => a.patient_id)));
        const pkgPatients = await prisma.oPD_REG.findMany({
            where: { patient_id: { in: pIds } },
            select: { patient_id: true, full_name: true, phone: true },
        });
        const pkgPatientMap = new Map(pkgPatients.map((p: any) => [p.patient_id, p]));

        for (const [admId, postings] of consumedByAdmission) {
            const adm = admMap.get(admId);
            if (!adm) continue;
            const pt = pkgPatientMap.get(adm.patient_id);
            const billMap = new Map<string, any[]>();
            for (const p of postings) {
                const key = dispensingKey(p.posted_at);
                if (!billMap.has(key)) billMap.set(key, []);
                billMap.get(key)!.push(p);
            }
            for (const [bKey, items] of billMap) {
                const gross = items.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
                pkgPharmBills.push({
                    id: `pkg-${admId}-${bKey}`,
                    invoice_number: null,
                    patient_id: adm.patient_id,
                    patient: pt || { full_name: 'Unknown', phone: '' },
                    admission_id: admId,
                    status: 'Package',
                    created_at: items[0].posted_at,
                    _isIpdPharmacy: true,
                    _isPackageConsumed: true,
                    _pharmTotal: gross,
                    _pharmBalance: 0,
                    _pharmDate: new Date(Math.max(...items.map((i: any) => new Date(i.posted_at).getTime()))),
                    _pharmItemCount: items.length,
                    _billKey: bKey,
                    _admissionStatus: adm.status,
                });
            }
        }
    }

    const unified = [
        ...opdPharmInvoices.map((pharm: any) => ({
            id: pharm.id,
            invoice_number: pharm.invoice_number,
            patient_name: pharm.patient?.full_name || 'Walk-in',
            net_amount: Number(pharm.net_amount || 0),
            balance_due: Number(pharm.balance_due || 0),
            created_at: pharm.created_at,
            source: 'PHARMACY',
            raw_inv_net: Number(pharm.net_amount || 0),
        })),
        ...ipdPharmBills.map((pharm: any) => ({
            id: pharm.id,
            invoice_number: pharm.invoice_number,
            patient_name: pharm.patient?.full_name || pharm._admPatient?.full_name || 'IPD Patient',
            net_amount: pharm._pharmTotal,
            balance_due: pharm._pharmBalance,
            created_at: pharm._pharmDate,
            source: 'IPD-PHARMACY',
            raw_inv_net: Number(pharm.net_amount || 0),
            raw_inv_bal: Number(pharm.balance_due || 0),
        })),
        ...pkgPharmBills.map((pharm: any) => ({
            id: pharm.id,
            invoice_number: pharm.invoice_number,
            patient_name: pharm.patient?.full_name || 'Package Patient',
            net_amount: pharm._pharmTotal,
            balance_due: 0,
            created_at: pharm._pharmDate,
            source: 'IPD-PKG-PHARMACY',
            raw_inv_net: 0,
        }))
    ];

    const range = getPresetRange('month');
    const filtered = unified.filter(inv => {
        const d = new Date(inv.created_at);
        return d >= range.from && d <= range.to;
    });

    console.log(`FILTERED THIS MONTH COUNT: ${filtered.length}`);
    let sumGross = 0;
    let sumBal = 0;
    for (let i = 0; i < filtered.length; i++) {
        const item = filtered[i];
        sumGross += item.net_amount;
        sumBal += item.balance_due;
        console.log(`${i+1}. [${item.source}] Inv #${item.invoice_number || 'PKG'} (${item.patient_name}) date=${new Date(item.created_at).toISOString().slice(0, 16)}: net=${item.net_amount}, bal=${item.balance_due} (IPD Inv Raw Net=${item.raw_inv_net})`);
    }
    console.log(`TOTAL GROSS: ${sumGross}`);
    console.log(`TOTAL BALANCE: ${sumBal}`);
}

debugThisMonthInvoices().catch(console.error).finally(() => prisma.$disconnect());
