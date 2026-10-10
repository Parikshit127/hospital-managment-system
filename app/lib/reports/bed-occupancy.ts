/**
 * IPD Bed Occupancy engine.
 *
 * Pure, side-effect-free calculation module (no DB, no server-only imports) so the
 * numbers can be unit-tested and reused by the report action, Excel export and UI types.
 *
 * ── How occupancy is measured ────────────────────────────────────────────────────────
 * Occupancy is time-weighted, not a count of `beds.status = 'Occupied'` at one instant.
 *
 *   occupancy % = occupied bed-hours / (beds × observed hours)
 *
 * Occupied bed-hours come from each admission's actual bed allocation:
 *   - the stay starts at `admissions.admission_date`
 *   - every `bed_transfers` row moves the patient to `to_bed_id` at its `created_at`
 *   - a fully Discharged stay ends at `discharge_date`
 *   - a stay still `Admitted` runs to "now" — this includes "semi discharged" patients
 *     (summary authored, `discharge_date` set) because they still hold the bed until
 *     the final discharge (see app/lib/admission-status.ts)
 *   - Cancelled admissions never count: the bed is freed on cancel
 *
 * Per bed, overlapping stays are merged, so a bed can never be more than 100% occupied
 * even if the source data has an overlap.
 *
 * ── Known data limits (surfaced to the user, not hidden) ─────────────────────────────
 *   - `beds` has no commissioning/retirement dates, so today's bed list is applied to
 *     the whole period (archived beds are included only if they were occupied in it).
 *   - `beds.status` has no history, so Blocked/Maintenance/Reserved/Cleaning are only
 *     known for "now". Blocked beds are reported only for live (range includes now) views.
 */

import { bedLabel } from '@/app/lib/bed-label';

export const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export const BLOCKED_STATUSES = ['Blocked', 'Maintenance'] as const;
export type OccupancyDimension = 'department' | 'ward' | 'category' | 'wardType';

// ─── Inputs ──────────────────────────────────────────────────────────────────

export interface BedRec {
    bed_id: string;
    bed_name: string | null;
    bed_category: string | null;
    ward_id: number | null;
    status: string | null;
    is_isolation: boolean;
}

export interface WardRec {
    ward_id: number;
    ward_name: string;
    ward_type: string | null;
    department_id: string | null;
    department_name: string | null;
}

export interface AdmissionRec {
    admission_id: string;
    status: string;
    admission_date: Date;
    discharge_date: Date | null;
    bed_id: string | null;
    ward_id: number | null;
    discharge_type: string | null;
    is_death: boolean;
}

export interface TransferRec {
    admission_id: string;
    from_bed_id: string | null;
    to_bed_id: string | null;
    created_at: Date;
}

/** One calendar day in the hospital's timezone. `end` is exclusive. Epoch ms. */
export interface DayWindow {
    key: string; // YYYY-MM-DD
    start: number;
    end: number;
}

export interface OccupancyScope {
    departmentId?: string | null;
    wardId?: number | null;
    bedCategory?: string | null;
}

export interface OccupancyInput {
    beds: BedRec[];
    wards: WardRec[];
    /** Admissions overlapping the range (any status). Cancelled ones are only counted. */
    admissions: AdmissionRec[];
    transfers: TransferRec[];
    days: DayWindow[];
    now: Date;
    scope?: OccupancyScope;
}

// ─── Outputs ─────────────────────────────────────────────────────────────────

export interface OccupancyGroupRow {
    key: string;
    label: string;
    /** Parent context, e.g. the department a ward belongs to. */
    parent: string | null;
    totalBeds: number;
    bedDaysAvailable: number;
    bedDaysOccupied: number;
    occupancyPct: number;
    avgOccupiedBeds: number;
    avgVacantBeds: number;
    /** As-of snapshot (end of range, or now when the range includes today). */
    occupiedAsOf: number;
    vacantAsOf: number;
    /** null when the view is historical — bed status history is not recorded. */
    blockedAsOf: number | null;
    admissions: number;
    discharges: number;
    deaths: number;
    /** Average length of stay (days) of patients discharged in range. */
    alosDays: number | null;
}

export interface OccupancyBedRow {
    bedId: string;
    bedLabel: string;
    ward: string;
    department: string;
    category: string;
    currentStatus: string;
    stays: number;
    bedDaysOccupied: number;
    bedDaysAvailable: number;
    occupancyPct: number;
    occupiedAsOf: boolean;
}

export interface OccupancyDayRow {
    date: string;
    totalBeds: number;
    observedHours: number;
    avgOccupiedBeds: number;
    closingOccupiedBeds: number;
    avgVacantBeds: number;
    occupancyPct: number;
    admissions: number;
    discharges: number;
}

export interface OccupancySnapshot {
    asOf: string; // ISO
    isLive: boolean;
    total: number;
    occupied: number;
    vacant: number;
    /** null when !isLive: status history is not recorded. */
    blocked: number | null;
    available: number | null;
    cleaning: number | null;
    reserved: number | null;
    occupancyPct: number;
}

export interface OccupancyIntegrity {
    /** Bed flagged Occupied but no active admission holds it. */
    statusOccupiedNoPatient: string[];
    /** Active admission holds the bed but its status is not Occupied. */
    patientWithoutOccupiedStatus: string[];
}

export interface OccupancyDataQuality {
    admissionsWithoutBed: number;
    dischargedWithoutDate: number;
    overlappingStays: number;
    unknownBedStays: number;
    archivedBedsIncluded: number;
}

export interface OccupancySummary {
    totalBeds: number;
    observedDays: number;
    bedDaysAvailable: number;
    bedDaysOccupied: number;
    occupancyPct: number;
    avgOccupiedBeds: number;
    avgVacantBeds: number;
    admissions: number;
    discharges: number;
    deaths: number;
    cancelled: number;
    awaitingFinalDischarge: number;
    netCensusChange: number;
    alosDays: number | null;
    bedTurnoverRate: number | null;
    turnoverIntervalDays: number | null;
    peakDay: { date: string; occupancyPct: number } | null;
    lowDay: { date: string; occupancyPct: number } | null;
    dischargeTypes: { type: string; count: number }[];
}

export interface OccupancyResult {
    range: { start: string; end: string; effectiveEndAt: string; days: number };
    summary: OccupancySummary;
    snapshot: OccupancySnapshot;
    byDepartment: OccupancyGroupRow[];
    byWard: OccupancyGroupRow[];
    byCategory: OccupancyGroupRow[];
    byWardType: OccupancyGroupRow[];
    beds: OccupancyBedRow[];
    daily: OccupancyDayRow[];
    integrity: OccupancyIntegrity | null;
    dataQuality: OccupancyDataQuality;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface Seg {
    bedId: string;
    start: number;
    end: number;
    admissionId: string;
}

interface Stay {
    admissionId: string;
    segs: Seg[];
    stayStart: number;
    stayEnd: number;
    firstBedId: string | null;
    lastBedId: string | null;
    dischargedWithoutDate: boolean;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (num: number, den: number) => (den > 0 ? r1((num / den) * 100) : 0);

/** Index of the day containing `t`, or -1 when outside [days[0].start, last.end). */
function dayIndexOf(days: DayWindow[], t: number): number {
    let lo = 0;
    let hi = days.length - 1;
    if (hi < 0 || t < days[0].start || t >= days[hi].end) return -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (t < days[mid].start) hi = mid - 1;
        else if (t >= days[mid].end) lo = mid + 1;
        else return mid;
    }
    return -1;
}

/**
 * Turn one admission + its bed transfers into the ordered list of (bed, from, to)
 * allocations. Returns null for admissions that never held a bed (Cancelled / unknown
 * status).
 */
export function buildStay(adm: AdmissionRec, allTransfers: TransferRec[], nowMs: number): Stay | null {
    const stayStart = adm.admission_date.getTime();
    let stayEnd: number;
    let dischargedWithoutDate = false;

    if (adm.status === 'Admitted') {
        stayEnd = nowMs;
    } else if (adm.status === 'Discharged') {
        if (adm.discharge_date) {
            stayEnd = Math.min(adm.discharge_date.getTime(), nowMs);
        } else {
            stayEnd = stayStart;
            dischargedWithoutDate = true;
        }
    } else {
        return null;
    }
    if (stayEnd < stayStart) stayEnd = stayStart;

    const ts = allTransfers
        .filter((t) => t.admission_id === adm.admission_id)
        .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());

    // transferPatient stores from_bed_id "" when the admission had no bed.
    let bed: string | null = ts.length > 0 ? ts[0].from_bed_id || null : adm.bed_id || null;
    const firstBedId = bed ?? (ts.length > 0 ? ts[0].to_bed_id || null : null);

    const segs: Seg[] = [];
    let cursor = stayStart;
    const corrections: TransferRec[] = [];

    for (const t of ts) {
        const at = t.created_at.getTime();
        if (at > stayEnd) {
            // Transfer logged after the stay ended: "post-discharge ward/bed correction".
            // It re-states which bed the patient was in; it is not a movement.
            corrections.push(t);
            continue;
        }
        const switchAt = Math.max(at, cursor);
        if (bed && switchAt > cursor) segs.push({ bedId: bed, start: cursor, end: switchAt, admissionId: adm.admission_id });
        cursor = switchAt;
        bed = t.to_bed_id || bed;
    }
    if (corrections.length > 0) {
        bed = corrections[corrections.length - 1].to_bed_id || bed;
    }
    if (bed && stayEnd > cursor) segs.push({ bedId: bed, start: cursor, end: stayEnd, admissionId: adm.admission_id });

    return {
        admissionId: adm.admission_id,
        segs,
        stayStart,
        stayEnd,
        firstBedId,
        lastBedId: bed,
        dischargedWithoutDate,
    };
}

function mergeIntervals(segs: { start: number; end: number }[]): { start: number; end: number }[] {
    const sorted = [...segs].sort((a, b) => a.start - b.start);
    const out: { start: number; end: number }[] = [];
    for (const s of sorted) {
        const last = out[out.length - 1];
        if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
        else out.push({ start: s.start, end: s.end });
    }
    return out;
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function computeBedOccupancy(input: OccupancyInput): OccupancyResult {
    const nowMs = input.now.getTime();
    // Days that have not started yet carry no observation.
    const days = input.days.filter((d) => d.start < nowMs);
    const emptyQuality: OccupancyDataQuality = {
        admissionsWithoutBed: 0,
        dischargedWithoutDate: 0,
        overlappingStays: 0,
        unknownBedStays: 0,
        archivedBedsIncluded: 0,
    };

    const wardMap = new Map<number, WardRec>();
    for (const w of input.wards) wardMap.set(w.ward_id, w);
    const bedMap = new Map<string, BedRec>();
    for (const b of input.beds) bedMap.set(b.bed_id, b);

    const rangeStart = days.length ? days[0].start : nowMs;
    const rangeEnd = days.length ? Math.min(days[days.length - 1].end, nowMs) : nowMs;
    const observed = days.map((d) => Math.max(0, Math.min(d.end, nowMs) - d.start));
    const totalObservedMs = observed.reduce((a, b) => a + b, 0);
    const isLive = days.length > 0 && days[days.length - 1].end > nowMs;
    const asOfMs = isLive ? nowMs : rangeEnd;

    // 1. Stays + allocation segments --------------------------------------------------
    const transfersByAdm = new Map<string, TransferRec[]>();
    for (const t of input.transfers) {
        const arr = transfersByAdm.get(t.admission_id);
        if (arr) arr.push(t);
        else transfersByAdm.set(t.admission_id, [t]);
    }

    const quality = { ...emptyQuality };
    const stays: Stay[] = [];
    const cancelledAdmissions: AdmissionRec[] = [];
    const admById = new Map<string, AdmissionRec>();
    for (const adm of input.admissions) {
        admById.set(adm.admission_id, adm);
        if (adm.status === 'Cancelled') {
            cancelledAdmissions.push(adm);
            continue;
        }
        const stay = buildStay(adm, transfersByAdm.get(adm.admission_id) ?? [], nowMs);
        if (!stay) continue;
        if (stay.dischargedWithoutDate) quality.dischargedWithoutDate++;
        if (!stay.firstBedId && !stay.lastBedId) quality.admissionsWithoutBed++;
        stays.push(stay);
    }

    // 2. Per-bed merged occupancy intervals ----------------------------------------
    const segsByBed = new Map<string, Seg[]>();
    for (const s of stays) {
        for (const seg of s.segs) {
            if (!bedMap.has(seg.bedId)) {
                quality.unknownBedStays++;
                continue;
            }
            const arr = segsByBed.get(seg.bedId);
            if (arr) arr.push(seg);
            else segsByBed.set(seg.bedId, [seg]);
        }
    }

    const mergedByBed = new Map<string, { start: number; end: number }[]>();
    for (const [bedId, segs] of segsByBed) {
        const merged = mergeIntervals(segs);
        // Distinct overlapping stays in one bed = a source-data conflict.
        const raw = [...segs].sort((a, b) => a.start - b.start);
        for (let i = 1; i < raw.length; i++) {
            if (raw[i].start < raw[i - 1].end && raw[i].admissionId !== raw[i - 1].admissionId) {
                quality.overlappingStays++;
                break;
            }
        }
        mergedByBed.set(bedId, merged);
    }

    // 3. Which beds count (scope + capacity) ---------------------------------------
    const scope = input.scope ?? {};
    const hasScope = !!(scope.departmentId || scope.wardId || scope.bedCategory);
    const bedCategoryOf = (b: BedRec) => (b.bed_category && b.bed_category.trim()) || 'Uncategorised';
    const inScope = (b: BedRec) => {
        const w = b.ward_id != null ? wardMap.get(b.ward_id) : undefined;
        if (scope.wardId != null && b.ward_id !== scope.wardId) return false;
        if (scope.departmentId && w?.department_id !== scope.departmentId) return false;
        if (scope.bedCategory && bedCategoryOf(b) !== scope.bedCategory) return false;
        return true;
    };

    const occupiedInRange = (bedId: string): boolean => {
        const iv = mergedByBed.get(bedId);
        return !!iv && iv.some((x) => x.end > rangeStart && x.start < rangeEnd);
    };

    const capacityBeds: BedRec[] = [];
    for (const b of input.beds) {
        if (!inScope(b)) continue;
        if (b.status === 'Archived') {
            // Retired bed: only part of capacity if it actually held a patient in the range.
            if (!occupiedInRange(b.bed_id)) continue;
            quality.archivedBedsIncluded++;
        }
        capacityBeds.push(b);
    }
    const capacityIds = new Set(capacityBeds.map((b) => b.bed_id));

    // 4. Occupied ms per bed per day ------------------------------------------------
    const nDays = days.length;
    const bedDayMs = new Map<string, Float64Array>();
    for (const b of capacityBeds) {
        const arr = new Float64Array(nDays);
        const iv = mergedByBed.get(b.bed_id);
        if (iv) {
            for (const x of iv) {
                const s = Math.max(x.start, rangeStart);
                const e = Math.min(x.end, rangeEnd);
                if (e <= s) continue;
                let i = dayIndexOf(days, s);
                while (i >= 0 && i < nDays && days[i].start < e) {
                    const ds = Math.max(s, days[i].start);
                    const de = Math.min(e, days[i].end, nowMs);
                    if (de > ds) arr[i] += de - ds;
                    i++;
                }
            }
        }
        bedDayMs.set(b.bed_id, arr);
    }

    const occupiedAt = (bedId: string, t: number) => {
        const iv = mergedByBed.get(bedId);
        return !!iv && iv.some((x) => x.start <= t && t < x.end);
    };

    // 5. Admission / discharge events -----------------------------------------------
    const inScopeBedId = (bedId: string | null) => {
        if (!hasScope) return true;
        return !!bedId && capacityIds.has(bedId);
    };

    interface Event {
        group: BedRec | null;
        dayIdx: number;
    }
    const admissionEvents: Event[] = [];
    const dischargeEvents: (Event & { los: number; dischargeType: string; death: boolean })[] = [];
    let awaitingFinalDischarge = 0;

    for (const s of stays) {
        const adm = admById.get(s.admissionId)!;
        const admAt = adm.admission_date.getTime();
        if (admAt >= rangeStart && admAt < rangeEnd && inScopeBedId(s.firstBedId)) {
            admissionEvents.push({ group: s.firstBedId ? bedMap.get(s.firstBedId) ?? null : null, dayIdx: dayIndexOf(days, admAt) });
        }
        if (adm.status === 'Discharged' && adm.discharge_date) {
            const dAt = adm.discharge_date.getTime();
            if (dAt >= rangeStart && dAt < rangeEnd && inScopeBedId(s.lastBedId)) {
                const death = adm.is_death || adm.discharge_type === 'Death';
                dischargeEvents.push({
                    group: s.lastBedId ? bedMap.get(s.lastBedId) ?? null : null,
                    dayIdx: dayIndexOf(days, dAt),
                    los: Math.max(0, dAt - admAt) / DAY_MS,
                    dischargeType: death ? 'Death' : adm.discharge_type || 'Unspecified',
                    death,
                });
            }
        }
        if (adm.status === 'Admitted' && adm.discharge_date && inScopeBedId(s.lastBedId)) awaitingFinalDischarge++;
    }

    const cancelled = cancelledAdmissions.filter((a) => {
        const t = a.admission_date.getTime();
        return t >= rangeStart && t < rangeEnd && inScopeBedId(a.bed_id);
    }).length;

    // 6. Snapshot as-of ------------------------------------------------------------
    const snapshotBeds = capacityBeds.filter((b) => b.status !== 'Archived');
    const asOfProbe = asOfMs - 1;
    const occupiedNowSet = new Set<string>();
    for (const b of snapshotBeds) if (occupiedAt(b.bed_id, asOfProbe)) occupiedNowSet.add(b.bed_id);

    const statusOf = (b: BedRec) => b.status || 'Available';
    const isBlocked = (b: BedRec) => (BLOCKED_STATUSES as readonly string[]).includes(statusOf(b));
    const blockedNowSet = new Set<string>();
    if (isLive) for (const b of snapshotBeds) if (!occupiedNowSet.has(b.bed_id) && isBlocked(b)) blockedNowSet.add(b.bed_id);

    const countStatusVacant = (status: string) =>
        snapshotBeds.filter((b) => !occupiedNowSet.has(b.bed_id) && statusOf(b) === status).length;

    const snapshot: OccupancySnapshot = {
        asOf: new Date(asOfMs).toISOString(),
        isLive,
        total: snapshotBeds.length,
        occupied: occupiedNowSet.size,
        blocked: isLive ? blockedNowSet.size : null,
        vacant: snapshotBeds.length - occupiedNowSet.size - (isLive ? blockedNowSet.size : 0),
        available: isLive ? countStatusVacant('Available') : null,
        cleaning: isLive ? countStatusVacant('Cleaning') : null,
        reserved: isLive ? countStatusVacant('Reserved') : null,
        occupancyPct: pct(occupiedNowSet.size, snapshotBeds.length),
    };

    let integrity: OccupancyIntegrity | null = null;
    if (isLive) {
        integrity = {
            statusOccupiedNoPatient: snapshotBeds
                .filter((b) => b.status === 'Occupied' && !occupiedNowSet.has(b.bed_id))
                .map((b) => bedLabel(b))
                .slice(0, 25),
            patientWithoutOccupiedStatus: snapshotBeds
                .filter((b) => occupiedNowSet.has(b.bed_id) && b.status !== 'Occupied')
                .map((b) => bedLabel(b))
                .slice(0, 25),
        };
    }

    // 7. Daily series --------------------------------------------------------------
    const admPerDay = new Array<number>(nDays).fill(0);
    const disPerDay = new Array<number>(nDays).fill(0);
    for (const e of admissionEvents) if (e.dayIdx >= 0) admPerDay[e.dayIdx]++;
    for (const e of dischargeEvents) if (e.dayIdx >= 0) disPerDay[e.dayIdx]++;

    const totalBeds = capacityBeds.length;
    const daily: OccupancyDayRow[] = days.map((d, i) => {
        let occMs = 0;
        let closing = 0;
        const probe = Math.min(d.end, nowMs) - 1;
        for (const b of capacityBeds) {
            occMs += bedDayMs.get(b.bed_id)![i];
            if (occupiedAt(b.bed_id, probe)) closing++;
        }
        const obs = observed[i];
        const avgOcc = obs > 0 ? occMs / obs : 0;
        return {
            date: d.key,
            totalBeds,
            observedHours: r2(obs / HOUR_MS),
            avgOccupiedBeds: r2(avgOcc),
            closingOccupiedBeds: closing,
            avgVacantBeds: r2(Math.max(0, totalBeds - avgOcc)),
            occupancyPct: totalBeds > 0 && obs > 0 ? pct(occMs, totalBeds * obs) : 0,
            admissions: admPerDay[i],
            discharges: disPerDay[i],
        };
    });

    // 8. Group rollups -------------------------------------------------------------
    const wardOf = (b: BedRec) => (b.ward_id != null ? wardMap.get(b.ward_id) : undefined);
    const keyOf: Record<OccupancyDimension, (b: BedRec) => { key: string; label: string; parent: string | null }> = {
        department: (b) => {
            const w = wardOf(b);
            return { key: w?.department_id ?? '__none', label: w?.department_name || 'Unassigned', parent: null };
        },
        ward: (b) => {
            const w = wardOf(b);
            return {
                key: b.ward_id != null ? String(b.ward_id) : '__none',
                label: w?.ward_name || 'No ward',
                parent: w?.department_name || null,
            };
        },
        category: (b) => {
            const c = bedCategoryOf(b);
            return { key: c, label: c, parent: null };
        },
        wardType: (b) => {
            const t = wardOf(b)?.ward_type || 'Unspecified';
            return { key: t, label: t, parent: null };
        },
    };

    const buildGroups = (dim: OccupancyDimension): OccupancyGroupRow[] => {
        const k = keyOf[dim];
        const map = new Map<string, OccupancyGroupRow & { _occMs: number; _los: number; _losN: number }>();
        const ensure = (b: BedRec) => {
            const g = k(b);
            let row = map.get(g.key);
            if (!row) {
                row = {
                    key: g.key, label: g.label, parent: g.parent,
                    totalBeds: 0, bedDaysAvailable: 0, bedDaysOccupied: 0, occupancyPct: 0,
                    avgOccupiedBeds: 0, avgVacantBeds: 0,
                    occupiedAsOf: 0, vacantAsOf: 0, blockedAsOf: isLive ? 0 : null,
                    admissions: 0, discharges: 0, deaths: 0, alosDays: null,
                    _occMs: 0, _los: 0, _losN: 0,
                };
                map.set(g.key, row);
            }
            return row;
        };

        for (const b of capacityBeds) {
            const row = ensure(b);
            row.totalBeds++;
            let ms = 0;
            for (const v of bedDayMs.get(b.bed_id)!) ms += v;
            row._occMs += ms;
            if (b.status !== 'Archived') {
                if (occupiedNowSet.has(b.bed_id)) row.occupiedAsOf++;
                else if (isLive && blockedNowSet.has(b.bed_id)) row.blockedAsOf = (row.blockedAsOf ?? 0) + 1;
                else row.vacantAsOf++;
            }
        }
        for (const e of admissionEvents) if (e.group && capacityIds.has(e.group.bed_id)) ensure(e.group).admissions++;
        for (const e of dischargeEvents) {
            if (!e.group || !capacityIds.has(e.group.bed_id)) continue;
            const row = ensure(e.group);
            row.discharges++;
            if (e.death) row.deaths++;
            row._los += e.los;
            row._losN++;
        }

        const totalDays = totalObservedMs / DAY_MS;
        return [...map.values()]
            .map(({ _occMs, _los, _losN, ...row }) => {
                const availMs = row.totalBeds * totalObservedMs;
                return {
                    ...row,
                    bedDaysAvailable: r2(availMs / DAY_MS),
                    bedDaysOccupied: r2(_occMs / DAY_MS),
                    occupancyPct: pct(_occMs, availMs),
                    avgOccupiedBeds: totalDays > 0 ? r2(_occMs / DAY_MS / totalDays) : 0,
                    avgVacantBeds: totalDays > 0 ? r2(Math.max(0, row.totalBeds - _occMs / DAY_MS / totalDays)) : 0,
                    alosDays: _losN > 0 ? r1(_los / _losN) : null,
                };
            })
            .sort((a, b) => b.occupancyPct - a.occupancyPct || a.label.localeCompare(b.label));
    };

    // 9. Bed-wise rows -------------------------------------------------------------
    const bedRows: OccupancyBedRow[] = capacityBeds
        .map((b) => {
            let ms = 0;
            for (const v of bedDayMs.get(b.bed_id)!) ms += v;
            const w = wardOf(b);
            const distinct = new Set<string>();
            for (const s of segsByBed.get(b.bed_id) ?? []) {
                if (s.end > rangeStart && s.start < rangeEnd) distinct.add(s.admissionId);
            }
            return {
                bedId: b.bed_id,
                bedLabel: bedLabel(b),
                ward: w?.ward_name || 'No ward',
                department: w?.department_name || 'Unassigned',
                category: bedCategoryOf(b),
                currentStatus: b.status || 'Available',
                stays: distinct.size,
                bedDaysOccupied: r2(ms / DAY_MS),
                bedDaysAvailable: r2(totalObservedMs / DAY_MS),
                occupancyPct: pct(ms, totalObservedMs),
                occupiedAsOf: occupiedNowSet.has(b.bed_id),
            };
        })
        .sort((a, b) => a.ward.localeCompare(b.ward) || a.bedLabel.localeCompare(b.bedLabel, undefined, { numeric: true }));

    // 10. Summary ------------------------------------------------------------------
    let occTotalMs = 0;
    for (const arr of bedDayMs.values()) for (const v of arr) occTotalMs += v;
    const availTotalMs = totalBeds * totalObservedMs;
    const observedDays = totalObservedMs / DAY_MS;

    const dischargeTypeCounts = new Map<string, number>();
    let losSum = 0;
    let deaths = 0;
    for (const e of dischargeEvents) {
        dischargeTypeCounts.set(e.dischargeType, (dischargeTypeCounts.get(e.dischargeType) ?? 0) + 1);
        losSum += e.los;
        if (e.death) deaths++;
    }

    const rankable = daily.filter((d) => d.observedHours > 0);
    const peak = rankable.length ? rankable.reduce((a, b) => (b.occupancyPct > a.occupancyPct ? b : a)) : null;
    const low = rankable.length ? rankable.reduce((a, b) => (b.occupancyPct < a.occupancyPct ? b : a)) : null;

    const occBedDays = occTotalMs / DAY_MS;
    const availBedDays = availTotalMs / DAY_MS;
    const dischargesN = dischargeEvents.length;

    const summary: OccupancySummary = {
        totalBeds,
        observedDays: r2(observedDays),
        bedDaysAvailable: r2(availBedDays),
        bedDaysOccupied: r2(occBedDays),
        occupancyPct: pct(occTotalMs, availTotalMs),
        avgOccupiedBeds: observedDays > 0 ? r2(occBedDays / observedDays) : 0,
        avgVacantBeds: observedDays > 0 ? r2(Math.max(0, totalBeds - occBedDays / observedDays)) : 0,
        admissions: admissionEvents.length,
        discharges: dischargesN,
        deaths,
        cancelled,
        awaitingFinalDischarge,
        netCensusChange: admissionEvents.length - dischargesN,
        alosDays: dischargesN > 0 ? r1(losSum / dischargesN) : null,
        bedTurnoverRate: totalBeds > 0 ? r2(dischargesN / totalBeds) : null,
        turnoverIntervalDays: dischargesN > 0 ? r2(Math.max(0, availBedDays - occBedDays) / dischargesN) : null,
        peakDay: peak ? { date: peak.date, occupancyPct: peak.occupancyPct } : null,
        lowDay: low ? { date: low.date, occupancyPct: low.occupancyPct } : null,
        dischargeTypes: [...dischargeTypeCounts.entries()]
            .map(([type, count]) => ({ type, count }))
            .sort((a, b) => b.count - a.count),
    };

    return {
        range: {
            start: days[0]?.key ?? '',
            end: days[days.length - 1]?.key ?? '',
            effectiveEndAt: new Date(rangeEnd).toISOString(),
            days: nDays,
        },
        summary,
        snapshot,
        byDepartment: buildGroups('department'),
        byWard: buildGroups('ward'),
        byCategory: buildGroups('category'),
        byWardType: buildGroups('wardType'),
        beds: bedRows,
        daily,
        integrity,
        dataQuality: quality,
    };
}
