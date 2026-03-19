import { getTenantPrisma } from '@/backend/db';
import { redirect } from 'next/navigation';
import {
    FlaskConical, Clock, CheckCircle2, Download, AlertTriangle,
    TrendingUp, TrendingDown, Minus, Activity, ShieldCheck, ShieldAlert
} from 'lucide-react';
import { getPatientSession } from '../login/actions';

type RangeInfo = {
    normal_range_min: number | null;
    normal_range_max: number | null;
    unit: string | null;
};

type LabOrder = {
    id: number;
    barcode: string;
    test_type: string;
    status: string;
    result_value: string | null;
    report_url: string | null;
    is_critical: boolean;
    created_at: Date;
};

type RangeStatus = 'normal' | 'borderline-low' | 'borderline-high' | 'abnormal-low' | 'abnormal-high' | 'unknown';

/** Parse a numeric value from result_value string */
function parseNumericResult(value: string): number | null {
    const cleaned = value.replace(/[^0-9.\-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
}

/** Determine the range status of a result value */
function getRangeStatus(value: number, min: number | null, max: number | null): RangeStatus {
    if (min === null || max === null) return 'unknown';

    const range = max - min;
    const borderlineMargin = range * 0.1; // 10% margin for borderline

    if (value >= min && value <= max) return 'normal';
    if (value < min) {
        return value >= min - borderlineMargin ? 'borderline-low' : 'abnormal-low';
    }
    return value <= max + borderlineMargin ? 'borderline-high' : 'abnormal-high';
}

/** Get styling based on range status */
function getStatusStyle(status: RangeStatus) {
    switch (status) {
        case 'normal':
            return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', badge: 'Normal', icon: ShieldCheck };
        case 'borderline-low':
        case 'borderline-high':
            return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', badge: 'Borderline', icon: AlertTriangle };
        case 'abnormal-low':
        case 'abnormal-high':
            return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', badge: 'Abnormal', icon: ShieldAlert };
        default:
            return { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', badge: 'N/A', icon: Minus };
    }
}

/** Calculate percentage change between two values */
function percentChange(previous: number, current: number): string {
    const change = ((current - previous) / previous) * 100;
    const sign = change > 0 ? '+' : '';
    return `${sign}${change.toFixed(1)}%`;
}

/** Compute the position (0–100) of a value on the range bar */
function rangeBarPosition(value: number, min: number, max: number): number {
    const range = max - min;
    const padding = range * 0.3; // extend bar 30% beyond range on each side
    const barMin = min - padding;
    const barMax = max + padding;
    const pos = ((value - barMin) / (barMax - barMin)) * 100;
    return Math.max(0, Math.min(100, pos));
}

/** Range visualization bar */
function RangeBar({ value, min, max, unit }: { value: number; min: number; max: number; unit: string | null }) {
    const range = max - min;
    const padding = range * 0.3;
    const barMin = min - padding;
    const barMax = max + padding;

    // Normal zone position (as percentage of full bar)
    const normalStart = ((min - barMin) / (barMax - barMin)) * 100;
    const normalEnd = ((max - barMin) / (barMax - barMin)) * 100;
    const markerPos = rangeBarPosition(value, min, max);

    const status = getRangeStatus(value, min, max);
    const markerColor =
        status === 'normal' ? 'bg-emerald-500' :
        status.startsWith('borderline') ? 'bg-amber-500' : 'bg-red-500';

    return (
        <div className="mt-2">
            <div className="relative h-2.5 bg-red-100 rounded-full overflow-hidden">
                {/* Normal range zone */}
                <div
                    className="absolute h-full bg-emerald-200 rounded-full"
                    style={{ left: `${normalStart}%`, width: `${normalEnd - normalStart}%` }}
                />
                {/* Value marker */}
                <div
                    className={`absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${markerColor} rounded-full border-2 border-white shadow-md`}
                    style={{ left: `${markerPos}%`, transform: `translate(-50%, -50%)` }}
                />
            </div>
            <div className="flex justify-between mt-1">
                <span className="text-[9px] text-gray-400">{min}{unit ? ` ${unit}` : ''}</span>
                <span className="text-[9px] text-gray-400">{max}{unit ? ` ${unit}` : ''}</span>
            </div>
        </div>
    );
}

export default async function PatientLabsPage() {
    const session = await getPatientSession();
    if (!session) redirect('/patient/login');

    const db = getTenantPrisma(session.organization_id);

    // Fetch lab orders and test inventory in parallel
    const [labOrders, testInventory] = await Promise.all([
        db.lab_orders.findMany({
            where: { patient_id: session.id },
            orderBy: { created_at: 'desc' },
        }),
        db.lab_test_inventory.findMany({
            select: { test_name: true, normal_range_min: true, normal_range_max: true, unit: true },
        }),
    ]);

    // Build range lookup map
    const rangeMap = new Map<string, RangeInfo>();
    for (const t of testInventory) {
        rangeMap.set(t.test_name.toLowerCase(), {
            normal_range_min: t.normal_range_min,
            normal_range_max: t.normal_range_max,
            unit: t.unit,
        });
    }

    const completed = labOrders.filter((l: any) => l.status === 'Completed') as LabOrder[];
    const pending = labOrders.filter((l: any) => l.status !== 'Completed') as LabOrder[];

    // Group completed orders by test_type for historical comparison
    const historyByTest = new Map<string, LabOrder[]>();
    for (const lab of completed) {
        const key = lab.test_type.toLowerCase();
        if (!historyByTest.has(key)) historyByTest.set(key, []);
        historyByTest.get(key)!.push(lab);
    }

    // Summary stats
    const totalCompleted = completed.length;
    const abnormalCount = completed.filter(lab => {
        if (!lab.result_value) return false;
        const numVal = parseNumericResult(lab.result_value);
        if (numVal === null) return false;
        const range = rangeMap.get(lab.test_type.toLowerCase());
        if (!range) return false;
        const status = getRangeStatus(numVal, range.normal_range_min, range.normal_range_max);
        return status.startsWith('abnormal');
    }).length;
    const criticalCount = completed.filter(l => l.is_critical).length;

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold text-gray-900">Lab Results</h2>
                <p className="text-sm text-gray-500 mt-1">
                    {totalCompleted} completed, {pending.length} pending
                </p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Total Tests</p>
                    <p className="text-2xl font-black text-gray-900 mt-1">{labOrders.length}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
                    <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">Normal</p>
                    <p className="text-2xl font-black text-emerald-700 mt-1">{totalCompleted - abnormalCount - criticalCount}</p>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                    <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">Abnormal</p>
                    <p className="text-2xl font-black text-amber-700 mt-1">{abnormalCount}</p>
                </div>
                <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
                    <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wider">Critical</p>
                    <p className="text-2xl font-black text-red-700 mt-1">{criticalCount}</p>
                </div>
            </div>

            {/* Pending Tests */}
            {pending.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
                    <h3 className="font-bold text-amber-800 mb-4 flex items-center gap-2">
                        <Clock className="h-5 w-5" /> Pending Tests
                    </h3>
                    <div className="space-y-3">
                        {pending.map((lab: any) => (
                            <div key={lab.id} className="flex items-center justify-between bg-white rounded-xl p-4 border border-amber-100">
                                <div>
                                    <p className="font-semibold text-gray-900 text-sm">{lab.test_type}</p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Ordered: {new Date(lab.created_at).toLocaleDateString()}
                                        {lab.barcode && <span className="ml-2 font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">#{lab.barcode}</span>}
                                    </p>
                                </div>
                                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide bg-amber-100 text-amber-700">
                                    {lab.status}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Completed Results — Enhanced Cards */}
            <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
                <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
                    <FlaskConical className="h-5 w-5 text-purple-500" /> Lab Results
                </h3>

                {completed.length === 0 && pending.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                        <FlaskConical className="h-10 w-10 mx-auto mb-3 text-gray-200" />
                        <p className="text-sm">No lab tests ordered yet.</p>
                    </div>
                ) : completed.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                        <Activity className="h-8 w-8 mx-auto mb-2 text-gray-200" />
                        <p className="text-sm">No completed results yet. Your pending tests will appear here once ready.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {completed.map((lab) => {
                            const range = rangeMap.get(lab.test_type.toLowerCase());
                            const numericValue = lab.result_value ? parseNumericResult(lab.result_value) : null;
                            const hasRange = range && range.normal_range_min !== null && range.normal_range_max !== null;
                            const rangeStatus = (numericValue !== null && hasRange)
                                ? getRangeStatus(numericValue, range!.normal_range_min, range!.normal_range_max)
                                : 'unknown';
                            const style = getStatusStyle(rangeStatus);
                            const StatusIcon = style.icon;

                            // Historical comparison
                            const history = historyByTest.get(lab.test_type.toLowerCase()) || [];
                            const currentIndex = history.findIndex(h => h.id === lab.id);
                            const previousResult = currentIndex < history.length - 1 ? history[currentIndex + 1] : null;
                            const prevNumeric = previousResult?.result_value ? parseNumericResult(previousResult.result_value) : null;

                            return (
                                <div
                                    key={lab.id}
                                    className={`${style.bg} border ${style.border} rounded-2xl p-5 transition-all`}
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        {/* Left: Test info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <p className="font-bold text-gray-900 text-sm truncate">{lab.test_type}</p>
                                                {lab.is_critical && (
                                                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-red-500 text-white uppercase tracking-wide">
                                                        Critical
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-500">
                                                {new Date(lab.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                {lab.barcode && (
                                                    <span className="ml-2 font-mono bg-white/60 px-1.5 py-0.5 rounded text-[10px]">
                                                        #{lab.barcode}
                                                    </span>
                                                )}
                                            </p>

                                            {/* Range bar */}
                                            {numericValue !== null && hasRange && (
                                                <RangeBar
                                                    value={numericValue}
                                                    min={range!.normal_range_min!}
                                                    max={range!.normal_range_max!}
                                                    unit={range!.unit}
                                                />
                                            )}

                                            {/* Historical comparison */}
                                            {prevNumeric !== null && numericValue !== null && (
                                                <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                                                    {numericValue > prevNumeric ? (
                                                        <TrendingUp className="h-3.5 w-3.5 text-red-500" />
                                                    ) : numericValue < prevNumeric ? (
                                                        <TrendingDown className="h-3.5 w-3.5 text-emerald-500" />
                                                    ) : (
                                                        <Minus className="h-3.5 w-3.5 text-gray-400" />
                                                    )}
                                                    <span>
                                                        Previous: {prevNumeric}{range?.unit ? ` ${range.unit}` : ''}
                                                        {' → '}Current: {numericValue}{range?.unit ? ` ${range.unit}` : ''}
                                                        {' '}
                                                        <span className={numericValue > prevNumeric ? 'text-red-600 font-semibold' : numericValue < prevNumeric ? 'text-emerald-600 font-semibold' : 'text-gray-400'}>
                                                            ({percentChange(prevNumeric, numericValue)})
                                                        </span>
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Right: Result value + status */}
                                        <div className="text-right flex-shrink-0">
                                            {lab.result_value ? (
                                                <div>
                                                    <p className={`text-xl font-black ${style.text}`}>
                                                        {lab.result_value}
                                                        {range?.unit && (
                                                            <span className="text-xs font-medium ml-1 opacity-70">
                                                                {range.unit}
                                                            </span>
                                                        )}
                                                    </p>
                                                    {rangeStatus !== 'unknown' && (
                                                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold mt-1 ${style.text}`}>
                                                            <StatusIcon className="h-3 w-3" />
                                                            {style.badge}
                                                        </span>
                                                    )}
                                                    {hasRange && (
                                                        <p className="text-[10px] text-gray-400 mt-0.5">
                                                            Ref: {range!.normal_range_min}–{range!.normal_range_max} {range!.unit}
                                                        </p>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-gray-300 italic">No value</span>
                                            )}

                                            {/* Download report */}
                                            {lab.barcode && (
                                                <a
                                                    href={`/api/reports/lab/pdf?barcode=${lab.barcode}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition mt-2"
                                                >
                                                    <Download className="h-3.5 w-3.5" /> Report
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
