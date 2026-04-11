'use client';

import { AlertTriangle, CheckCircle, Info } from 'lucide-react';

interface DepositTrackerProps {
    totalDeposit: number;
    totalCharged: number;
    percentage?: number;
    alertLevel?: 'none' | 'info' | 'warning' | 'critical' | 'blocked';
    compact?: boolean;
}

export function DepositTracker({
    totalDeposit,
    totalCharged,
    percentage: pctProp,
    alertLevel: alertProp,
    compact = false,
}: DepositTrackerProps) {
    const percentage = pctProp ?? (totalDeposit > 0 ? Math.min(Math.round((totalCharged / totalDeposit) * 100), 100) : 0);
    const alertLevel = alertProp ?? (
        percentage >= 100 ? 'blocked' :
        percentage >= 90 ? 'critical' :
        percentage >= 80 ? 'warning' :
        percentage >= 70 ? 'info' : 'none'
    );

    const barColor =
        alertLevel === 'blocked' ? 'bg-red-600' :
        alertLevel === 'critical' ? 'bg-red-500' :
        alertLevel === 'warning' ? 'bg-amber-500' :
        alertLevel === 'info' ? 'bg-yellow-400' :
        'bg-emerald-500';

    const bgColor =
        alertLevel === 'blocked' ? 'bg-red-50 border-red-300' :
        alertLevel === 'critical' ? 'bg-red-50 border-red-200' :
        alertLevel === 'warning' ? 'bg-amber-50 border-amber-200' :
        alertLevel === 'info' ? 'bg-yellow-50 border-yellow-200' :
        'bg-gray-50 border-gray-200';

    const alertText =
        alertLevel === 'blocked' ? '🚫 Deposit exhausted — new charges blocked until top-up' :
        alertLevel === 'critical' ? '🔴 >90% deposit consumed — collect top-up immediately' :
        alertLevel === 'warning' ? '⚠️ >80% deposit consumed — notify patient/family' :
        alertLevel === 'info' ? 'ℹ️ >70% deposit consumed' :
        null;

    if (compact) {
        return (
            <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] font-semibold text-gray-500">
                    <span>Deposit Used</span>
                    <span className={`font-black ${alertLevel === 'none' ? 'text-emerald-600' : alertLevel === 'info' ? 'text-yellow-600' : alertLevel === 'warning' ? 'text-amber-600' : 'text-red-600'}`}>
                        {percentage}%
                    </span>
                </div>
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(percentage, 100)}%` }} />
                </div>
            </div>
        );
    }

    return (
        <div className={`border rounded-2xl p-4 space-y-3 ${bgColor}`}>
            <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-700">Deposit Consumption</p>
                <span className={`text-lg font-black ${
                    alertLevel === 'none' ? 'text-emerald-600' :
                    alertLevel === 'info' ? 'text-yellow-600' :
                    alertLevel === 'warning' ? 'text-amber-600' :
                    'text-red-600'
                }`}>{percentage}%</span>
            </div>

            {/* Progress bar */}
            <div className="h-3 bg-white/70 rounded-full overflow-hidden border border-gray-200">
                <div className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${Math.min(percentage, 100)}%` }} />
            </div>

            {/* Numbers */}
            <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                    <p className="text-gray-400 font-medium">Total Deposit</p>
                    <p className="font-black text-gray-900">₹{totalDeposit.toLocaleString()}</p>
                </div>
                <div>
                    <p className="text-gray-400 font-medium">Charges to Date</p>
                    <p className="font-black text-gray-900">₹{totalCharged.toLocaleString()}</p>
                </div>
                <div>
                    <p className="text-gray-400 font-medium">Available</p>
                    <p className={`font-black ${totalDeposit - totalCharged >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        ₹{Math.max(0, totalDeposit - totalCharged).toLocaleString()}
                    </p>
                </div>
                <div>
                    <p className="text-gray-400 font-medium">Balance Due</p>
                    <p className={`font-black ${totalCharged - totalDeposit > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                        {totalCharged - totalDeposit > 0 ? `₹${(totalCharged - totalDeposit).toLocaleString()}` : '—'}
                    </p>
                </div>
            </div>

            {/* Alert banner */}
            {alertText && (
                <div className="flex items-center gap-2 text-xs font-semibold">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                    {alertText}
                </div>
            )}
        </div>
    );
}
