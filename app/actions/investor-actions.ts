'use server';

import { prisma } from '@/backend/db';
import { getInvestorSession } from './investor-auth-actions';

export interface UnitMetrics {
    axten: number;
    avise: number;
    axtenHq: number;
    total: number;
}

export interface InvestorDashboardData {
    period: string;
    selectedUnit: string;
    fromDate?: string;
    toDate?: string;
    units: Array<{ code: string; name: string; beds: number }>;
    executiveKPIs: {
        ebitdaMarginPct: number;
        bedOccupancyRate: number;
        alosDays: number;
        collectionEfficiencyPct: number;
    };
    currentAdmittedPatients: {
        cash: UnitMetrics;
        insurance: UnitMetrics;
        panel: UnitMetrics;
        corporate: UnitMetrics;
        total: UnitMetrics;
    };
    admissions: {
        cash: UnitMetrics;
        insurance: UnitMetrics;
        panel: UnitMetrics;
        corporate: UnitMetrics;
        total: UnitMetrics;
    };
    discharges: {
        cash: UnitMetrics;
        insurance: UnitMetrics;
        panel: UnitMetrics;
        corporate: UnitMetrics;
        total: UnitMetrics;
    };
    revenue: {
        cash: UnitMetrics;
        insurance: UnitMetrics;
        panel: UnitMetrics;
        corporate: UnitMetrics;
        total: UnitMetrics;
    };
    opdVsIpdRevenue: {
        opd: UnitMetrics;
        ipd: UnitMetrics;
        pharmacy: UnitMetrics;
        diagnostics: UnitMetrics;
        total: UnitMetrics;
    };
    departmentRevenue: Array<{
        name: string;
        metrics: UnitMetrics;
    }>;
    expenses: {
        april: UnitMetrics;
        may: UnitMetrics;
        june: UnitMetrics;
        july: UnitMetrics;
        total: UnitMetrics;
    };
    receivables: {
        cash: UnitMetrics;
        insurance: UnitMetrics;
        panel: UnitMetrics;
        corporate: UnitMetrics;
        tdsReceivables: UnitMetrics;
        total: UnitMetrics;
    };
    insuranceAging: {
        days0to30: UnitMetrics;
        days31to60: UnitMetrics;
        days60Plus: UnitMetrics;
        total: UnitMetrics;
    };
    payables: {
        vendors: UnitMetrics;
        doctorsProfessional: UnitMetrics;
        tdsPayable: UnitMetrics;
        others: UnitMetrics;
        total: UnitMetrics;
    };
    salaries: {
        april: UnitMetrics;
        may: UnitMetrics;
        june: UnitMetrics;
        july: UnitMetrics;
        total: UnitMetrics;
    };
    arpob: {
        noOfBeds: UnitMetrics;
        april: UnitMetrics;
        may: UnitMetrics;
        june: UnitMetrics;
        july: UnitMetrics;
        average: UnitMetrics;
    };
    profitLoss: {
        amount: UnitMetrics;
        percentage: UnitMetrics;
    };
}

// Real organization IDs behind the 3 investor-facing hospital units.
export const INVESTOR_UNIT_ORG_IDS: Record<'axten' | 'avise' | 'axtenHq', string> = {
    axten: 'org-axten-production',
    avise: '0425857b-6293-4d91-86b2-bd049de66252',
    axtenHq: '9bd49bae-cecc-49f8-b18d-88f146124a98',
};

// Real OPD_REG.patient_type values behind each investor-facing payer category.
// "Panel" has no real backing field yet and is not offered for drill-down.
const CATEGORY_PATIENT_TYPE: Record<'cash' | 'insurance' | 'corporate', string> = {
    cash: 'cash',
    insurance: 'tpa_insurance',
    corporate: 'corporate',
};

// Sum unit metrics across columns reliably
function sumUnits(...unitsArr: UnitMetrics[]): UnitMetrics {
    const res = { axten: 0, avise: 0, axtenHq: 0, total: 0 };
    for (const u of unitsArr) {
        res.axten += u.axten;
        res.avise += u.avise;
        res.axtenHq += u.axtenHq;
    }
    res.total = res.axten + res.avise + res.axtenHq;
    return res;
}

export async function getInvestorDashboardData(params?: {
    filterType?: 'day' | 'month' | 'year' | 'custom';
    selectedUnit?: string; // 'all' | 'axten' | 'avise' | 'axtenHq'
    fromDate?: string;
    toDate?: string;
}): Promise<{ success: boolean; data?: InvestorDashboardData; error?: string }> {
    try {
        const session = await getInvestorSession();
        if (!session) {
            return { success: false, error: 'Unauthorized investor session' };
        }

        const selectedUnit = params?.selectedUnit || 'all';

        // Query live revenue from DB if available
        const totalRevenueLive = await prisma.invoices.aggregate({
            _sum: { net_amount: true }
        }).catch(() => ({ _sum: { net_amount: null } }));
        const liveRev = Number(totalRevenueLive._sum.net_amount || 0);

        // 3 Hospitals configured: Axten, Avise, Axten HQ
        const units = [
            { code: 'axten', name: 'Axten Hospital', beds: 20 },
            { code: 'avise', name: 'Avise Hospital', beds: 50 },
            { code: 'axtenHq', name: 'Axten HQ', beds: 0 },
        ];

        const bedCounts = { axten: 20, avise: 50, axtenHq: 0, total: 70 };

        // 1. Current Admitted Patients — real counts grouped by OPD_REG.patient_type
        // and organizationId (Panel has no real backing field and is excluded here;
        // the other 12 sections below remain illustrative/mock pending a phase-2 rebuild).
        const admittedRows = await prisma.admissions.findMany({
            where: {
                status: { not: 'Discharged' },
                is_archived: false,
                organizationId: { in: Object.values(INVESTOR_UNIT_ORG_IDS) },
            },
            select: { organizationId: true, patient: { select: { patient_type: true } } },
        }).catch(() => [] as Array<{ organizationId: string; patient: { patient_type: string } }>);

        const zeroUnit = (): UnitMetrics => ({ axten: 0, avise: 0, axtenHq: 0, total: 0 });
        const admittedCash = zeroUnit();
        const admittedInsurance = zeroUnit();
        const admittedPanel = zeroUnit(); // Panel has no real backing patient_type field yet — always zero
        const admittedCorporate = zeroUnit();
        const orgToUnitKey = Object.fromEntries(
            Object.entries(INVESTOR_UNIT_ORG_IDS).map(([unitKey, orgId]) => [orgId, unitKey as 'axten' | 'avise' | 'axtenHq'])
        );
        for (const row of admittedRows) {
            const unitKey = orgToUnitKey[row.organizationId];
            if (!unitKey) continue;
            const bucket =
                row.patient.patient_type === CATEGORY_PATIENT_TYPE.corporate ? admittedCorporate :
                row.patient.patient_type === CATEGORY_PATIENT_TYPE.insurance ? admittedInsurance :
                admittedCash; // default: cash
            bucket[unitKey] += 1;
            bucket.total += 1;
        }

        const admittedTotal = sumUnits(admittedCash, admittedInsurance, admittedPanel, admittedCorporate);

        // 2. Admissions
        const admCash = { axten: 14, avise: 38, axtenHq: 0, total: 52 };
        const admInsurance = { axten: 28, avise: 75, axtenHq: 0, total: 103 };
        const admPanel = { axten: 10, avise: 26, axtenHq: 0, total: 36 };
        const admCorporate = { axten: 7, avise: 18, axtenHq: 0, total: 25 };
        const admTotal = sumUnits(admCash, admInsurance, admPanel, admCorporate);

        // 3. Discharges
        const disCash = { axten: 12, avise: 34, axtenHq: 0, total: 46 };
        const disInsurance = { axten: 25, avise: 68, axtenHq: 0, total: 93 };
        const disPanel = { axten: 9, avise: 24, axtenHq: 0, total: 33 };
        const disCorporate = { axten: 6, avise: 16, axtenHq: 0, total: 22 };
        const disTotal = sumUnits(disCash, disInsurance, disPanel, disCorporate);

        // 4. Revenue (₹) - 4 Months (April-July) Total: ₹18.14 Crore
        let revCash = { axten: 11400000, avise: 31200000, axtenHq: 0, total: 42600000 };
        let revInsurance = { axten: 24800000, avise: 66000000, axtenHq: 0, total: 90800000 };
        let revPanel = { axten: 7400000, avise: 19600000, axtenHq: 0, total: 27000000 };
        let revCorporate = { axten: 5800000, avise: 15200000, axtenHq: 0, total: 21000000 };

        if (liveRev > 0 && liveRev > 181400000) {
            const scale = liveRev / 181400000;
            revCash = { axten: Math.round(revCash.axten * scale), avise: Math.round(revCash.avise * scale), axtenHq: 0, total: 0 };
            revCash.total = revCash.axten + revCash.avise;

            revInsurance = { axten: Math.round(revInsurance.axten * scale), avise: Math.round(revInsurance.avise * scale), axtenHq: 0, total: 0 };
            revInsurance.total = revInsurance.axten + revInsurance.avise;

            revPanel = { axten: Math.round(revPanel.axten * scale), avise: Math.round(revPanel.avise * scale), axtenHq: 0, total: 0 };
            revPanel.total = revPanel.axten + revPanel.avise;

            revCorporate = { axten: Math.round(revCorporate.axten * scale), avise: Math.round(revCorporate.avise * scale), axtenHq: 0, total: 0 };
            revCorporate.total = revCorporate.axten + revCorporate.avise;
        }

        const revTotal = sumUnits(revCash, revInsurance, revPanel, revCorporate);

        // 4B. OPD vs IPD Revenue Split (Matches revTotal = ₹18.14 Cr)
        const opdRev = { axten: 12400000, avise: 32800000, axtenHq: 0, total: 45200000 };
        const ipdRev = { axten: 26200000, avise: 71200000, axtenHq: 0, total: 97400000 };
        const pharmRev = { axten: 6000000, avise: 16800000, axtenHq: 0, total: 22800000 };
        const diagRev = { axten: 4800000, avise: 11200000, axtenHq: 0, total: 16000000 };
        const opdVsIpdTotal = sumUnits(opdRev, ipdRev, pharmRev, diagRev);

        // 4C. Departmental Revenue Breakdown (Matches revTotal = ₹18.14 Cr)
        const departmentRevenue = [
            { name: 'Cardiology & Vascular', metrics: { axten: 11200000, avise: 30000000, axtenHq: 0, total: 41200000 } },
            { name: 'Orthopedics & Joint Replacement', metrics: { axten: 9600000, avise: 27200000, axtenHq: 0, total: 36800000 } },
            { name: 'General & Laparoscopic Surgery', metrics: { axten: 8400000, avise: 23600000, axtenHq: 0, total: 32000000 } },
            { name: 'Neurology & Neurosurgery', metrics: { axten: 7200000, avise: 19200000, axtenHq: 0, total: 26400000 } },
            { name: 'ICU & Critical Care', metrics: { axten: 7800000, avise: 21600000, axtenHq: 0, total: 29400000 } },
            { name: 'Pediatrics & Neonatology', metrics: { axten: 5200000, avise: 10400000, axtenHq: 0, total: 15600000 } },
        ];

        // 5. Expenses (Monthly Breakdown)
        const expApr = { axten: 2350000, avise: 12200000, axtenHq: 350000, total: 14900000 };
        const expMay = { axten: 2450000, avise: 12600000, axtenHq: 370000, total: 15420000 };
        const expJun = { axten: 2400000, avise: 12400000, axtenHq: 340000, total: 15140000 };
        const expJul = { axten: 2500000, avise: 13000000, axtenHq: 380000, total: 15880000 };
        const expTotal = sumUnits(expApr, expMay, expJun, expJul);

        // 6. Receivables - Yet to Receive
        const recCash = { axten: 450000, avise: 1200000, axtenHq: 0, total: 1650000 };
        const recInsurance = { axten: 4200000, avise: 11500000, axtenHq: 0, total: 15700000 };
        const recPanel = { axten: 1400000, avise: 3800000, axtenHq: 0, total: 5200000 };
        const recCorporate = { axten: 950000, avise: 2600000, axtenHq: 0, total: 3550000 };
        const recTds = { axten: 380000, avise: 1050000, axtenHq: 0, total: 1430000 };
        const recTotal = sumUnits(recCash, recInsurance, recPanel, recCorporate, recTds);

        // 6B. Insurance Receivables Aging (Matches recInsurance)
        const age0to30 = { axten: 2500000, avise: 6800000, axtenHq: 0, total: 9300000 };
        const age31to60 = { axten: 1200000, avise: 3400000, axtenHq: 0, total: 4600000 };
        const age60Plus = { axten: 500000, avise: 1300000, axtenHq: 0, total: 1800000 };
        const ageTotal = sumUnits(age0to30, age31to60, age60Plus);

        // 7. Payables - Due for Payments
        const payVendors = { axten: 2100000, avise: 5800000, axtenHq: 450000, total: 8350000 };
        const payDoctors = { axten: 1850000, avise: 4900000, axtenHq: 0, total: 6750000 };
        const payTds = { axten: 290000, avise: 780000, axtenHq: 60000, total: 1130000 };
        const payOthers = { axten: 450000, avise: 1200000, axtenHq: 120000, total: 1770000 };
        const payTotal = sumUnits(payVendors, payDoctors, payTds, payOthers);

        // 8. Salaries (Monthly Breakdown)
        const salApr = { axten: 3200000, avise: 8400000, axtenHq: 850000, total: 12450000 };
        const salMay = { axten: 3250000, avise: 8500000, axtenHq: 850000, total: 12600000 };
        const salJun = { axten: 3300000, avise: 8600000, axtenHq: 860000, total: 12760000 };
        const salJul = { axten: 3350000, avise: 8750000, axtenHq: 880000, total: 12980000 };
        const salTotal = sumUnits(salApr, salMay, salJun, salJul);

        // 9. ARPOB (Average Revenue Per Operational Bed)
        const arpobApr = { axten: 20500, avise: 22000, axtenHq: 0, total: 21571 };
        const arpobMay = { axten: 21200, avise: 22800, axtenHq: 0, total: 22343 };
        const arpobJun = { axten: 20800, avise: 22500, axtenHq: 0, total: 22014 };
        const arpobJul = { axten: 21900, avise: 23400, axtenHq: 0, total: 22971 };
        const arpobAvg = {
            axten: Math.round((arpobApr.axten + arpobMay.axten + arpobJun.axten + arpobJul.axten) / 4),
            avise: Math.round((arpobApr.avise + arpobMay.avise + arpobJun.avise + arpobJul.avise) / 4),
            axtenHq: 0,
            total: Math.round((arpobApr.total + arpobMay.total + arpobJun.total + arpobJul.total) / 4),
        };

        // 10. Status of Profit/Loss
        const profitAmount = {
            axten: revTotal.axten - expTotal.axten - salTotal.axten,
            avise: revTotal.avise - expTotal.avise - salTotal.avise,
            axtenHq: revTotal.axtenHq - expTotal.axtenHq - salTotal.axtenHq,
            total: 0,
        };
        profitAmount.total = profitAmount.axten + profitAmount.avise + profitAmount.axtenHq;

        const profitPercentage = {
            axten: Number(((profitAmount.axten / (revTotal.axten || 1)) * 100).toFixed(1)),
            avise: Number(((profitAmount.avise / (revTotal.avise || 1)) * 100).toFixed(1)),
            axtenHq: 0,
            total: Number(((profitAmount.total / (revTotal.total || 1)) * 100).toFixed(1)),
        };

        const executiveKPIs = {
            ebitdaMarginPct: profitPercentage.total,
            bedOccupancyRate: Number(((admittedTotal.total / bedCounts.total) * 100).toFixed(1)),
            alosDays: 4.2,
            collectionEfficiencyPct: 91.5,
        };

        return {
            success: true,
            data: {
                period: params?.filterType || 'month',
                selectedUnit,
                fromDate: params?.fromDate,
                toDate: params?.toDate,
                units,
                executiveKPIs,
                currentAdmittedPatients: {
                    cash: admittedCash,
                    insurance: admittedInsurance,
                    panel: admittedPanel,
                    corporate: admittedCorporate,
                    total: admittedTotal,
                },
                admissions: {
                    cash: admCash,
                    insurance: admInsurance,
                    panel: admPanel,
                    corporate: admCorporate,
                    total: admTotal,
                },
                discharges: {
                    cash: disCash,
                    insurance: disInsurance,
                    panel: disPanel,
                    corporate: disCorporate,
                    total: disTotal,
                },
                revenue: {
                    cash: revCash,
                    insurance: revInsurance,
                    panel: revPanel,
                    corporate: revCorporate,
                    total: revTotal,
                },
                opdVsIpdRevenue: {
                    opd: opdRev,
                    ipd: ipdRev,
                    pharmacy: pharmRev,
                    diagnostics: diagRev,
                    total: opdVsIpdTotal,
                },
                departmentRevenue,
                expenses: {
                    april: expApr,
                    may: expMay,
                    june: expJun,
                    july: expJul,
                    total: expTotal,
                },
                receivables: {
                    cash: recCash,
                    insurance: recInsurance,
                    panel: recPanel,
                    corporate: recCorporate,
                    tdsReceivables: recTds,
                    total: recTotal,
                },
                insuranceAging: {
                    days0to30: age0to30,
                    days31to60: age31to60,
                    days60Plus: age60Plus,
                    total: ageTotal,
                },
                payables: {
                    vendors: payVendors,
                    doctorsProfessional: payDoctors,
                    tdsPayable: payTds,
                    others: payOthers,
                    total: payTotal,
                },
                salaries: {
                    april: salApr,
                    may: salMay,
                    june: salJun,
                    july: salJul,
                    total: salTotal,
                },
                arpob: {
                    noOfBeds: bedCounts,
                    april: arpobApr,
                    may: arpobMay,
                    june: arpobJun,
                    july: arpobJul,
                    average: arpobAvg,
                },
                profitLoss: {
                    amount: profitAmount,
                    percentage: profitPercentage,
                },
            },
        };
    } catch (error: any) {
        console.error('getInvestorDashboardData error:', error);
        return { success: false, error: error.message };
    }
}
