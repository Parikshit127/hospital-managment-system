/**
 * Patient / admission trail — the single mapper from DB rows to timeline events.
 *
 * Before this file the same job was written three times: `getPatientTimeline` in
 * `doctor-actions.ts` (clinical), `getPatientTimeline` in `master-billing-actions.ts`
 * (financial), and an orphan `PatientTimeline.tsx` nobody imported. The billing copy
 * shipped two silent bugs (see `toIso` below), which is what a fork costs.
 *
 * Plain lib on purpose — NOT `'use server'`. It exports consts and sync functions,
 * which a server-action module may not do (LLM_INDEX §4.3).
 */

export type TrailGroup = 'clinical' | 'financial' | 'admin';

export type TrailKind =
    | 'admission'
    | 'discharge'
    | 'discharge_summary'
    | 'ward_round'
    | 'medical_note'
    | 'nursing_note'
    | 'vitals'
    | 'transfer'
    | 'diet'
    | 'nursing_task'
    | 'medication'
    | 'lab'
    | 'pharmacy'
    | 'appointment'
    | 'invoice_created'
    | 'invoice_finalized'
    | 'invoice_cancelled'
    | 'payment'
    | 'deposit'
    | 'refund'
    | 'preauth';

export interface TrailEvent {
    /** ISO 8601. Always valid — `pushEvent` drops events without a parseable date. */
    ts: string;
    kind: TrailKind;
    /** One-line headline, already humanised. */
    label: string;
    /** Secondary detail line. */
    meta?: string;
    /** Who did it, where the source row records that. */
    actor?: string;
    /** Signed rupee value for financial events; drives the running-total column. */
    amount?: number;
    group: TrailGroup;
}

export const TRAIL_GROUP: Record<TrailKind, TrailGroup> = {
    admission: 'admin',
    discharge: 'admin',
    discharge_summary: 'admin',
    ward_round: 'clinical',
    medical_note: 'clinical',
    nursing_note: 'clinical',
    vitals: 'clinical',
    transfer: 'admin',
    diet: 'clinical',
    nursing_task: 'clinical',
    medication: 'clinical',
    lab: 'clinical',
    pharmacy: 'clinical',
    appointment: 'admin',
    invoice_created: 'financial',
    invoice_finalized: 'financial',
    invoice_cancelled: 'financial',
    payment: 'financial',
    deposit: 'financial',
    refund: 'financial',
    preauth: 'financial',
};

/**
 * The guard this whole file exists for.
 *
 * `master-billing-actions.getPatientTimeline` read a `requested_at` column that
 * does not exist on `InsurancePreAuth`, so `new Date(undefined).toISOString()`
 * threw a RangeError. The action's own catch swallowed it and returned an empty
 * timeline — meaning any patient with a pre-auth saw a blank screen with no error.
 * Returning null here, and skipping the event, keeps one bad row from voiding the
 * whole trail.
 */
export function toIso(value: unknown): string | null {
    if (value === null || value === undefined || value === '') return null;
    const d = value instanceof Date ? value : new Date(value as string);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Prisma Decimal | string | number | null -> number. */
export function trailNum(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
        const n = parseFloat(value);
        return Number.isFinite(n) ? n : 0;
    }
    const asAny = value as { toNumber?: () => number };
    if (typeof asAny.toNumber === 'function') {
        const n = asAny.toNumber();
        return Number.isFinite(n) ? n : 0;
    }
    return 0;
}

function money(value: unknown): string {
    return `₹${trailNum(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Actor columns are inconsistent across the schema: `payments.received_by` holds a
 * username, while `IPDVitals.recorded_by`, `NursingNote.nurse_id` and
 * `WardRound.doctor_id` hold user UUIDs. Showing a raw UUID to a nurse is worse
 * than showing nothing, so an unresolved UUID is dropped rather than printed.
 */
function actorName(raw: unknown, actors?: Record<string, string>): string | undefined {
    const v = String(raw ?? '').trim();
    if (!v) return undefined;
    const mapped = actors?.[v];
    if (mapped) return mapped;
    return UUID_RE.test(v) ? undefined : v;
}

function clip(value: unknown, max = 90): string {
    const s = String(value ?? '').replace(/\s+/g, ' ').trim();
    return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** Push an event, silently skipping any row whose timestamp will not parse. */
function pushEvent(
    out: TrailEvent[],
    rawTs: unknown,
    kind: TrailKind,
    label: string,
    extra: Partial<Pick<TrailEvent, 'meta' | 'actor' | 'amount'>> = {},
): void {
    const ts = toIso(rawTs);
    if (!ts) return;
    out.push({ ts, kind, label, group: TRAIL_GROUP[kind], ...extra });
}

/**
 * Every source array is optional — callers pass only what they fetched, so the
 * same builder serves the admission-scoped chart trail, the patient-wide history
 * and the billing profile.
 */
export interface TrailSources {
    admissions?: any[];
    appointments?: any[];
    medicalNotes?: any[];
    nursingNotes?: any[];
    wardRounds?: any[];
    vitals?: any[];
    transfers?: any[];
    dietPlans?: any[];
    nursingTasks?: any[];
    medications?: any[];
    labOrders?: any[];
    pharmacyOrders?: any[];
    summaries?: any[];
    /** Payments are read from `invoice.payments` when included, or passed separately. */
    invoices?: any[];
    payments?: any[];
    deposits?: any[];
    refunds?: any[];
    preauths?: any[];
    /** user id -> display name, for the columns that store ids instead of names. */
    actors?: Record<string, string>;
}

export function buildTrail(sources: TrailSources): TrailEvent[] {
    const out: TrailEvent[] = [];
    const who = (raw: unknown) => actorName(raw, sources.actors);

    for (const a of sources.admissions ?? []) {
        pushEvent(out, a.admission_date, 'admission', `Admitted — ${a.admission_id ?? 'IPD'}`, {
            meta: [a.diagnosis, a.admission_type].filter(Boolean).join(' · ') || undefined,
            actor: who(a.doctor_name),
        });
        pushEvent(out, a.fit_for_discharge_at, 'discharge', 'Marked fit for discharge', {
            actor: who(a.fit_for_discharge_by),
        });
        pushEvent(out, a.discharge_date, 'discharge', `Discharged — ${a.discharge_type ?? a.status ?? 'Discharged'}`, {
            meta: a.discharge_disposition ?? undefined,
        });
        pushEvent(out, a.cancellation_date, 'discharge', 'Admission cancelled', {
            meta: a.cancellation_reason ?? undefined,
            actor: who(a.cancelled_by),
        });
    }

    for (const ap of sources.appointments ?? []) {
        pushEvent(out, ap.appointment_date, 'appointment', `OPD visit — ${ap.department ?? 'Consultation'}`, {
            meta: [ap.status, ap.reason_for_visit && clip(ap.reason_for_visit, 60)].filter(Boolean).join(' · ') || undefined,
            actor: who(ap.doctor_name),
        });
    }

    for (const n of sources.medicalNotes ?? []) {
        pushEvent(out, n.created_at, 'medical_note', `Doctor note — ${n.note_type ?? 'General'}`, {
            meta: clip(n.details),
        });
    }

    for (const n of sources.nursingNotes ?? []) {
        pushEvent(out, n.created_at, 'nursing_note', `Nursing note — ${n.note_type ?? 'General'}`, {
            meta: clip(n.details),
            actor: who(n.nurse_id),
        });
    }

    for (const r of sources.wardRounds ?? []) {
        // SOAP rounds store subjective/objective/assessment/plan; older rows only observations.
        const body = r.subjective || r.assessment || r.observations || r.plan_changes;
        pushEvent(out, r.created_at, 'ward_round', `Ward round — ${r.round_type ?? 'Attending'}`, {
            meta: [clip(body, 70), r.escalation_required ? '⚠ Escalation required' : null]
                .filter(Boolean)
                .join(' · ') || undefined,
            actor: who(r.doctor_id),
        });
    }

    for (const v of sources.vitals ?? []) {
        const parts = [
            v.bp_systolic && v.bp_diastolic ? `BP ${v.bp_systolic}/${v.bp_diastolic}` : null,
            v.heart_rate ? `HR ${v.heart_rate}` : null,
            v.spo2 ? `SpO₂ ${v.spo2}%` : null,
            v.temperature ? `Temp ${v.temperature}°` : null,
            v.respiratory_rate ? `RR ${v.respiratory_rate}` : null,
        ].filter(Boolean);
        pushEvent(
            out,
            v.created_at,
            'vitals',
            v.news_score === null || v.news_score === undefined
                ? 'Vitals recorded'
                : `Vitals recorded — NEWS ${v.news_score}${v.news_level ? ` (${v.news_level})` : ''}`,
            { meta: parts.join(' · ') || undefined, actor: who(v.recorded_by) },
        );
    }

    for (const t of sources.transfers ?? []) {
        pushEvent(out, t.created_at, 'transfer', 'Bed transfer', {
            meta: [t.from_bed_id ? `from ${t.from_bed_id}` : null, t.to_bed_id ? `to ${t.to_bed_id}` : null, t.reason]
                .filter(Boolean)
                .join(' · ') || undefined,
            actor: who(t.transferred_by),
        });
    }

    for (const d of sources.dietPlans ?? []) {
        pushEvent(out, d.created_at, 'diet', `Diet plan — ${d.diet_type ?? 'General'}`, {
            meta: clip(d.instructions, 70) || undefined,
            actor: who(d.created_by),
        });
    }

    for (const t of sources.nursingTasks ?? []) {
        pushEvent(out, t.scheduled_at, 'nursing_task', `Task scheduled — ${t.task_type ?? 'Nursing'}`, {
            meta: clip(t.description, 70) || undefined,
            actor: who(t.assigned_to),
        });
        pushEvent(out, t.completed_at, 'nursing_task', `Task completed — ${t.task_type ?? 'Nursing'}`, {
            actor: who(t.assigned_to),
        });
    }

    for (const m of sources.medications ?? []) {
        // Only the actual administration is a trail event; a scheduled dose that was
        // never given is an eMAR gap, not something that happened.
        pushEvent(out, m.administered_at, 'medication', `Medication given — ${m.medication_name}`, {
            meta: [m.dose, m.route, m.is_prn ? 'PRN' : null].filter(Boolean).join(' · ') || undefined,
            actor: who(m.administered_by),
        });
    }

    for (const l of sources.labOrders ?? []) {
        pushEvent(out, l.created_at, 'lab', `Lab ordered — ${l.test_type ?? 'Test'}`, {
            meta: [l.status, l.is_critical ? '⚠ Critical' : null].filter(Boolean).join(' · ') || undefined,
        });
    }

    for (const p of sources.pharmacyOrders ?? []) {
        const itemCount = Array.isArray(p.items) ? p.items.length : (p.total_items_requested ?? 0);
        pushEvent(out, p.created_at, 'pharmacy', `Pharmacy indent ${p.indent_number ?? ''}`.trim(), {
            meta: [itemCount ? `${itemCount} item(s)` : null, p.status, p.total_amount ? money(p.total_amount) : null]
                .filter(Boolean)
                .join(' · ') || undefined,
            actor: who(p.requested_by_name),
            amount: trailNum(p.total_amount) || undefined,
        });
    }

    for (const s of sources.summaries ?? []) {
        pushEvent(out, s.created_at, 'discharge_summary', 'Discharge summary prepared', {
            actor: who(s.prepared_by),
        });
    }

    for (const i of sources.invoices ?? []) {
        const ref = i.invoice_number ?? i.final_bill_number ?? `draft #${i.id}`;
        pushEvent(out, i.created_at, 'invoice_created', `Bill created — ${ref}`, {
            meta: [i.invoice_type, money(i.net_amount)].filter(Boolean).join(' · '),
            amount: trailNum(i.net_amount),
        });
        pushEvent(out, i.finalized_at, 'invoice_finalized', `Bill finalised — ${ref}`, {
            meta: money(i.net_amount),
            amount: trailNum(i.net_amount),
        });
        if (String(i.status).toLowerCase() === 'cancelled') {
            pushEvent(out, i.updated_at, 'invoice_cancelled', `Bill cancelled — ${ref}`, {
                meta: clip(i.notes, 70) || undefined,
            });
        }
        for (const p of i.payments ?? []) {
            pushEvent(out, p.created_at, 'payment', `Payment received — ${p.receipt_number ?? ''}`.trim(), {
                meta: [money(p.amount), p.payment_method, p.status].filter(Boolean).join(' · '),
                actor: who(p.received_by),
                amount: trailNum(p.amount),
            });
        }
    }

    for (const p of sources.payments ?? []) {
        pushEvent(out, p.created_at, 'payment', `Payment received — ${p.receipt_number ?? ''}`.trim(), {
            meta: [money(p.amount), p.payment_method, p.status].filter(Boolean).join(' · '),
            actor: who(p.received_by),
            amount: trailNum(p.amount),
        });
    }

    for (const d of sources.deposits ?? []) {
        pushEvent(out, d.created_at, 'deposit', `Deposit collected — ${d.deposit_number ?? ''}`.trim(), {
            meta: [money(d.amount), d.payment_method, d.status].filter(Boolean).join(' · '),
            actor: who(d.collected_by),
            amount: trailNum(d.amount),
        });
        pushEvent(out, d.cancelled_at, 'deposit', `Deposit cancelled — ${d.deposit_number ?? ''}`.trim(), {
            meta: clip(d.cancelled_reason, 70) || undefined,
            actor: who(d.cancelled_by),
        });
    }

    for (const r of sources.refunds ?? []) {
        pushEvent(out, r.created_at, 'refund', `Refund ${r.status ?? ''}`.trim(), {
            meta: [money(r.amount), r.payment_method, clip(r.reason, 50)].filter(Boolean).join(' · '),
            actor: who(r.processed_by),
            amount: -trailNum(r.amount),
        });
    }

    for (const p of sources.preauths ?? []) {
        // submitted_at, not requested_at — the column the old billing timeline invented.
        pushEvent(out, p.submitted_at, 'preauth', `Pre-auth submitted — ${p.pre_auth_number ?? 'draft'}`, {
            meta: [p.tpa_name, money(p.requested_amount), p.status].filter(Boolean).join(' · '),
            amount: trailNum(p.requested_amount),
        });
        pushEvent(out, p.responded_at, 'preauth', `Pre-auth ${p.status ?? 'responded'} — ${p.pre_auth_number ?? 'draft'}`, {
            meta: [p.approved_amount !== null && p.approved_amount !== undefined ? `approved ${money(p.approved_amount)}` : null, clip(p.tpa_remarks, 50)]
                .filter(Boolean)
                .join(' · ') || undefined,
            amount: trailNum(p.approved_amount) || undefined,
        });
    }

    return sortTrail(out);
}

/** Newest first. Stable enough for display; ties keep insertion order. */
export function sortTrail(events: TrailEvent[]): TrailEvent[] {
    return [...events].sort((a, b) => b.ts.localeCompare(a.ts));
}
