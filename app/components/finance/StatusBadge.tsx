'use client';

const STATUS_COLORS: Record<string, string> = {
    Draft: 'text-slate-500 bg-slate-50 border-slate-200',
    Proforma: 'text-blue-500 bg-blue-50 border-blue-200',
    Final: 'text-amber-500 bg-amber-50 border-amber-200',
    Paid: 'text-emerald-500 bg-emerald-50 border-emerald-200',
    Partial: 'text-orange-500 bg-orange-50 border-orange-200',
    Cancelled: 'text-rose-500 bg-rose-50 border-rose-200',
    Active: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    Applied: 'text-blue-600 bg-blue-50 border-blue-200',
    Refunded: 'text-amber-600 bg-amber-50 border-amber-200',
    Approved: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    Pending: 'text-amber-600 bg-amber-50 border-amber-200',
    Rejected: 'text-red-600 bg-red-50 border-red-200',
    Completed: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    Open: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    Closed: 'text-blue-600 bg-blue-50 border-blue-200',
    Locked: 'text-gray-600 bg-gray-100 border-gray-300',
};

export function StatusBadge({ status }: { status: string }) {
    const colors = STATUS_COLORS[status] || 'text-gray-500 bg-gray-50 border-gray-200';
    return (
        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${colors}`}>
            {status}
        </span>
    );
}
