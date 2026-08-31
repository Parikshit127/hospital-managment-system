/**
 * Back-office activity for the background engine: admission deposits, TPA claims,
 * general-ledger postings and emergency triage.
 *
 * These are the screens that stay conspicuously empty otherwise — the finance dashboard,
 * the TPA ageing table, the ledger, the ER board.
 *
 * The one rule that must not bend here: **a journal entry has to balance.** An unbalanced
 * entry is not merely unrealistic, it is something the software itself would never write,
 * and a trial balance that does not foot is visible at a glance. Every posting below is
 * constructed as paired debit/credit lines from the same amount.
 *
 * Plain library. Never add 'use server'.
 */
import { logSimAudit, actorFor, type StaffMember } from '@/app/lib/sim-staff';
import { generateDepositNumber, createWithUniqueRetry } from '@/app/lib/sequence-generator';

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const rint = (min: number, max: number) => Math.floor(rand(min, max + 1));
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

const MAX_PER_STATUS = 25;

/** Chance an admission collects an advance deposit at the counter. */
const P_DEPOSIT_ON_ADMISSION = 0.65;
/** Chance an insured patient's finalised bill is raised as a claim. */
const P_CLAIM_FROM_INSURED_BILL = 0.9;

const TRIAGE_LEVELS = ['Red', 'Orange', 'Yellow', 'Green'] as const;
const ER_COMPLAINTS = [
    'Chest pain radiating to left arm', 'Breathlessness since morning',
    'Road traffic accident — abrasions over right leg', 'High-grade fever with rigors',
    'Acute abdominal pain', 'Fall at home, suspected wrist fracture',
    'Palpitations and giddiness', 'Vomiting with dehydration',
    'Seizure episode witnessed at home', 'Severe headache with photophobia',
];
const ER_DEPARTMENTS = ['Emergency', 'General Medicine', 'Orthopaedics'];

const DENIAL_REASONS = [
    'Documentation incomplete — discharge summary not attached',
    'Service not covered under policy terms',
    'Pre-authorisation not obtained for planned admission',
];

export interface BackOfficeResult {
    depositsCollected: number;
    claimsSubmitted: number;
    claimsSettled: number;
    journalEntries: number;
    erTriaged: number;
}

/**
 * Post one balanced journal entry. `lines` must be given as debit/credit pairs that
 * already sum equally; the totals are computed from the lines rather than passed in, so
 * the header can never disagree with its own detail.
 */
async function postJournal(
    db: any,
    orgId: string,
    accounts: Map<string, string>,
    params: {
        entryType: string;
        narration: string;
        referenceType?: string;
        referenceId?: string;
        referenceNumber?: string;
        at: Date;
        createdBy?: string | null;
        lines: { account: string; debit?: number; credit?: number; description: string }[];
    },
): Promise<boolean> {
    const resolved = params.lines
        .map(l => ({ ...l, accountId: accounts.get(l.account) }))
        .filter(l => !!l.accountId);
    if (resolved.length !== params.lines.length) return false;

    const totalDebit = resolved.reduce((s, l) => s + (l.debit ?? 0), 0);
    const totalCredit = resolved.reduce((s, l) => s + (l.credit ?? 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01 || totalDebit === 0) return false;

    // Journal numbers are sequential per organization and per financial year.
    const fyStart = params.at.getMonth() >= 3 ? params.at.getFullYear() : params.at.getFullYear() - 1;
    const fy = `${String(fyStart).slice(-2)}-${String(fyStart + 1).slice(-2)}`;
    const prefix = `JV-${fy}-`;
    const count = await db.gL_JournalEntry.count({ where: { journal_number: { startsWith: prefix } } });
    const journalNumber = `${prefix}${String(count + 1).padStart(5, '0')}`;

    const entry = await db.gL_JournalEntry.create({
        data: {
            organizationId: orgId,
            journal_number: journalNumber,
            entry_date: params.at,
            entry_type: params.entryType,
            reference_type: params.referenceType ?? null,
            reference_id: params.referenceId ?? null,
            reference_number: params.referenceNumber ?? null,
            narration: params.narration,
            total_debit: totalDebit,
            total_credit: totalCredit,
            status: 'Posted',
            created_by: params.createdBy ?? null,
            created_at: params.at,
        },
    });

    let lineNumber = 1;
    for (const l of resolved) {
        await db.gL_JournalLine.create({
            data: {
                organizationId: orgId,
                journal_id: entry.id,
                line_number: lineNumber++,
                account_id: l.accountId!,
                debit_amount: l.debit ?? 0,
                credit_amount: l.credit ?? 0,
                description: l.description,
                created_at: params.at,
            },
        });
    }
    return true;
}

export async function runBackOffice(
    db: any,
    orgId: string,
    staff: StaffMember[],
    now: Date,
    tz: string,
): Promise<BackOfficeResult> {
    const out: BackOfficeResult = {
        depositsCollected: 0, claimsSubmitted: 0, claimsSettled: 0, journalEntries: 0, erTriaged: 0,
    };

    // Chart of accounts, keyed by code. Created by bootstrap-org.ts; if it is absent the
    // GL simply does not post rather than inventing accounts mid-tick.
    const accountRows: { id: string; account_code: string }[] =
        await db.gL_Account.findMany({ select: { id: true, account_code: true } });
    const accounts = new Map(accountRows.map(a => [a.account_code, a.id]));

    // ── Advance deposits ─────────────────────────────────────────────────────
    const admittedNoDeposit = await db.admissions.findMany({
        where: { status: 'Admitted' },
        take: MAX_PER_STATUS,
        select: { admission_id: true, patient_id: true, admission_date: true },
    });
    for (const adm of admittedNoDeposit) {
        const existing = await db.patientDeposit.count({ where: { admission_id: adm.admission_id } });
        if (existing > 0) continue;
        if (Math.random() > P_DEPOSIT_ON_ADMISSION) continue;

        const cashier = actorFor(staff, 'receptionist', now, tz);
        const amount = pick([5000, 10000, 15000, 20000, 25000]);
        const at = new Date(new Date(adm.admission_date).getTime() + rand(5, 40) * 60_000);
        if (at > now) continue;

        await createWithUniqueRetry(async () => {
            await db.patientDeposit.create({
                data: {
                    deposit_number: await generateDepositNumber(orgId, db),
                    patient_id: adm.patient_id,
                    admission_id: adm.admission_id,
                    amount,
                    payment_method: pick(['Cash', 'Card', 'UPI']),
                    status: 'Active',
                    collected_by: cashier?.username ?? null,
                    notes: 'Admission advance',
                    organizationId: orgId,
                    created_at: at,
                },
            });
        });
        out.depositsCollected++;

        // Cash in, patient-advance liability up.
        if (await postJournal(db, orgId, accounts, {
            entryType: 'Receipt',
            narration: `Admission advance received — ${adm.patient_id}`,
            referenceType: 'deposit', referenceId: adm.admission_id,
            at, createdBy: cashier?.username ?? null,
            lines: [
                { account: '1100', debit: amount, description: 'Cash / Bank' },
                { account: '2100', credit: amount, description: 'Patient advances' },
            ],
        })) out.journalEntries++;

        await logSimAudit({
            organizationId: orgId, actor: cashier,
            action: 'COLLECT_DEPOSIT', module: 'billing',
            entityType: 'admission', entityId: adm.admission_id,
            details: `Advance deposit Rs ${amount}`, at,
        });
    }

    // ── Revenue postings for finalised bills ─────────────────────────────────
    // One entry per invoice that has not been posted yet, matched by reference id.
    const unpostedInvoices = await db.invoices.findMany({
        where: { status: 'Final' },
        orderBy: { created_at: 'desc' },
        take: MAX_PER_STATUS,
        select: { id: true, invoice_number: true, net_amount: true, invoice_type: true, patient_id: true, created_at: true },
    });
    for (const inv of unpostedInvoices) {
        const already = await db.gL_JournalEntry.count({
            where: { reference_type: 'invoice', reference_id: String(inv.id) },
        });
        if (already > 0) continue;

        const amount = Number(inv.net_amount);
        if (!amount) continue;
        const biller = actorFor(staff, 'finance', now, tz);
        const revenueAccount = inv.invoice_type === 'IPD' ? '4100' : '4000';

        if (await postJournal(db, orgId, accounts, {
            entryType: 'Sales',
            narration: `${inv.invoice_type} bill ${inv.invoice_number} — ${inv.patient_id}`,
            referenceType: 'invoice', referenceId: String(inv.id), referenceNumber: inv.invoice_number,
            at: new Date(inv.created_at), createdBy: biller?.username ?? null,
            lines: [
                { account: '1200', debit: amount, description: 'Patient receivables' },
                { account: revenueAccount, credit: amount, description: inv.invoice_type === 'IPD' ? 'IPD revenue' : 'OPD revenue' },
            ],
        })) {
            out.journalEntries++;
            await logSimAudit({
                organizationId: orgId, actor: biller,
                action: 'POST_JOURNAL_ENTRY', module: 'gl',
                entityType: 'invoice', entityId: String(inv.id),
                details: `Revenue posted Rs ${amount}`, at: new Date(inv.created_at),
            });
        }
    }

    // ── TPA claims ───────────────────────────────────────────────────────────
    // Raised against finalised IPD bills for patients who hold a policy.
    const policies: { id: number; patient_id: string; provider_id: number }[] =
        await db.insurance_policies.findMany({ where: { status: 'Active' }, select: { id: true, patient_id: true, provider_id: true } });
    if (policies.length) {
        const policyByPatient = new Map(policies.map(p => [p.patient_id, p]));
        const insuredBills = await db.invoices.findMany({
            where: { status: 'Final', invoice_type: 'IPD', patient_id: { in: policies.map(p => p.patient_id) } },
            take: MAX_PER_STATUS,
            select: { id: true, patient_id: true, net_amount: true, admission_id: true, created_at: true },
        });

        for (const bill of insuredBills) {
            const already = await db.insurance_claims.count({ where: { invoice_id: bill.id } });
            if (already > 0) continue;
            if (Math.random() > P_CLAIM_FROM_INSURED_BILL) continue;
            const policy = policyByPatient.get(bill.patient_id);
            if (!policy) continue;

            const officer = actorFor(staff, 'finance', now, tz);
            const claimed = Number(bill.net_amount);
            const at = new Date(new Date(bill.created_at).getTime() + rand(30, 180) * 60_000);
            if (at > now) continue;

            await createWithUniqueRetry(async () => {
                const count = await db.insurance_claims.count();
                await db.insurance_claims.create({
                    data: {
                        claim_number: `${orgId.slice(0, 4).toUpperCase()}-CLM-${String(count + 1).padStart(5, '0')}`,
                        policy_id: policy.id,
                        invoice_id: bill.id,
                        admission_id: bill.admission_id,
                        claimed_amount: claimed,
                        status: 'Submitted',
                        organizationId: orgId,
                        submitted_at: at,
                        sla_due_at: new Date(at.getTime() + 45 * 86_400_000),
                    },
                });
            });
            out.claimsSubmitted++;

            await logSimAudit({
                organizationId: orgId, actor: officer,
                action: 'SUBMIT_CLAIM', module: 'insurance',
                entityType: 'invoice', entityId: String(bill.id),
                details: `Claim submitted Rs ${claimed}`, at,
            });
        }

        // Submitted claims get adjudicated — mostly approved, some short-paid, a few
        // rejected. A queue where every claim is approved is not what an ageing report
        // looks like, and the short-pay and denial screens would stay empty.
        const openClaims = await db.insurance_claims.findMany({
            where: { status: 'Submitted' },
            take: MAX_PER_STATUS,
            select: { id: true, claimed_amount: true, submitted_at: true },
        });
        for (const claim of openClaims) {
            const due = new Date(claim.submitted_at).getTime() + rand(40, 160) * 60_000;
            if (now.getTime() < due) continue;
            const at = new Date(due);
            const officer = actorFor(staff, 'finance', at, tz);
            const claimed = Number(claim.claimed_amount);
            const roll = Math.random();

            if (roll < 0.68) {
                await db.insurance_claims.update({
                    where: { id: claim.id },
                    data: { status: 'Approved', approved_amount: claimed, sanctioned_amount: claimed, reviewed_at: at },
                });
            } else if (roll < 0.9) {
                const approved = Math.round(claimed * rand(0.6, 0.9));
                await db.insurance_claims.update({
                    where: { id: claim.id },
                    data: {
                        status: 'Approved', approved_amount: approved, sanctioned_amount: approved,
                        short_pay_amount: claimed - approved, reviewed_at: at,
                    },
                });
            } else {
                await db.insurance_claims.update({
                    where: { id: claim.id },
                    data: {
                        status: 'Rejected', approved_amount: 0, rejected_amount: claimed,
                        rejection_reason: pick(DENIAL_REASONS), reviewed_at: at,
                    },
                });
            }
            out.claimsSettled++;

            await logSimAudit({
                organizationId: orgId, actor: officer,
                action: 'UPDATE_CLAIM_STATUS', module: 'insurance',
                entityType: 'claim', entityId: String(claim.id),
                details: 'Claim adjudicated by payer', at,
            });
        }
    }

    // ── Emergency triage ─────────────────────────────────────────────────────
    // A handful of walk-ins per tick get triaged, independently of the OPD queue.
    const erArrivals = Math.random() < 0.45 ? rint(1, 2) : 0;
    if (erArrivals > 0) {
        const recent = await db.oPD_REG.findMany({
            orderBy: { created_at: 'desc' }, take: 25,
            select: { patient_id: true, full_name: true },
        });
        for (let i = 0; i < Math.min(erArrivals, recent.length); i++) {
            const p = recent[rint(0, recent.length - 1)];
            const already = await db.triage_results.count({ where: { patient_id: p.patient_id } });
            if (already > 0) continue;

            const nurse = actorFor(staff, 'nurse', now, tz);
            const level = pick(TRIAGE_LEVELS);
            const at = new Date(now.getTime() - Math.floor(rand(0, 12 * 60_000)));
            await db.triage_results.create({
                data: {
                    patient_id: p.patient_id,
                    patient_name: p.full_name,
                    symptoms: pick(ER_COMPLAINTS),
                    duration: pick(['2 hours', '6 hours', '1 day', '3 days']),
                    severity: level === 'Red' ? 'Severe' : level === 'Orange' ? 'Moderate' : 'Mild',
                    triage_level: level,
                    recommended_department: pick(ER_DEPARTMENTS),
                    clinical_summary: 'Triaged at emergency reception. Vitals recorded, patient placed in queue.',
                    organizationId: orgId,
                    created_at: at,
                },
            });
            out.erTriaged++;

            await logSimAudit({
                organizationId: orgId, actor: nurse,
                action: 'TRIAGE_PATIENT', module: 'er',
                entityType: 'patient', entityId: p.patient_id,
                details: `Triage level ${level}`, at,
            });
        }
    }

    return out;
}
