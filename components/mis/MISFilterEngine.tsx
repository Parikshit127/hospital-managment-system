'use client';

import React, { useCallback, useTransition, useEffect, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { CalendarRange, UserSearch, X, SlidersHorizontal, Building2, CreditCard, Activity, Store, GitBranch, LayoutGrid } from 'lucide-react';
import type { FilterSpec } from '@/lib/mis/types';
import { MISPresetManager } from './MISPresetManager';

interface MISFilterEngineProps {
    reportId?: string;
    doctorOptions: string[];
    showDoctorFilter?: boolean;
    filterSpec?: FilterSpec;
}

export function MISFilterEngine({ reportId, doctorOptions, showDoctorFilter = true, filterSpec }: MISFilterEngineProps) {
    const router      = useRouter();
    const pathname    = usePathname();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const [departments, setDepartments] = useState<{id: string, name: string}[]>([]);
    const [stores, setStores] = useState<{id: string, name: string}[]>([]);
    // Bug 3B fix: branches state for the new Branch dropdown
    const [branches, setBranches] = useState<{id: string, name: string}[]>([]);

    useEffect(() => {
        if (filterSpec?.showDepartment) {
            fetch('/api/departments')
                .then(res => {
                    if (!res.ok) return [];
                    return res.json();
                })
                .then(data => {
                    const arr = Array.isArray(data) ? data : data?.data || [];
                    setDepartments(arr);
                })
                .catch(() => setDepartments([]));
        }
        if (filterSpec?.showStore) {
            fetch('/api/inventory/stores')
                .then(res => {
                    if (!res.ok) return [];
                    return res.json();
                })
                .then(data => {
                    const arr = Array.isArray(data) ? data : data?.data || [];
                    setStores(arr);
                })
                .catch(() => setStores([]));
        }
        // Bug 3B fix: fetch branches from admin branches API
        if (filterSpec?.showBranch) {
            fetch('/api/admin/branches')
                .then(res => {
                    if (!res.ok) return [];
                    return res.json();
                })
                .then(data => {
                    const arr = Array.isArray(data) ? data : data?.data || data?.branches || [];
                    setBranches(arr);
                })
                .catch(() => setBranches([]));
        }
    }, [filterSpec]);

    const startDate   = searchParams.get('startDate') ?? '';
    const endDate     = searchParams.get('endDate')   ?? '';
    const doctor      = searchParams.get('doctor')    ?? '';
    const department  = searchParams.get('department_id') ?? '';
    const billType    = searchParams.get('bill_type') ?? '';
    const statusVal   = searchParams.get('status') ?? '';
    const storeId     = searchParams.get('store_id') ?? '';
    // Bug 3B fix: read branch_id from URL
    const branchId    = searchParams.get('branch_id') ?? '';
    // Bug 3A fix: read service_category from URL
    const serviceCategory = searchParams.get('service_category') ?? '';

    const hasActiveFilters = Boolean(startDate || endDate || doctor || department || billType || statusVal || storeId || branchId || serviceCategory);

    const pushParam = useCallback(
        (key: string, value: string) => {
            const params = new URLSearchParams(searchParams.toString());
            if (value) {
                params.set(key, value);
            } else {
                params.delete(key);
            }
            startTransition(() => {
                router.push(`${pathname}?${params.toString()}`, { scroll: false });
            });
        },
        [router, pathname, searchParams]
    );

    const handleStartDate = (e: React.ChangeEvent<HTMLInputElement>) => pushParam('startDate', e.target.value);
    const handleEndDate   = (e: React.ChangeEvent<HTMLInputElement>) => pushParam('endDate', e.target.value);
    const handleDoctor    = (e: React.ChangeEvent<HTMLSelectElement>) => pushParam('doctor', e.target.value);
    const handleDepartment= (e: React.ChangeEvent<HTMLSelectElement>) => pushParam('department_id', e.target.value);
    const handleBillType  = (e: React.ChangeEvent<HTMLSelectElement>) => pushParam('bill_type', e.target.value);
    const handleStatus    = (e: React.ChangeEvent<HTMLSelectElement>) => pushParam('status', e.target.value);
    const handleStore     = (e: React.ChangeEvent<HTMLSelectElement>) => pushParam('store_id', e.target.value);
    // Bug 3B fix: branch handler
    const handleBranch    = (e: React.ChangeEvent<HTMLSelectElement>) => pushParam('branch_id', e.target.value);
    // Bug 3A fix: service category handler
    const handleServiceCategory = (e: React.ChangeEvent<HTMLSelectElement>) => pushParam('service_category', e.target.value);

    const handleClear = () => {
        startTransition(() => {
            router.push(pathname, { scroll: false });
        });
    };

    const shouldShowDoctor = filterSpec?.showDoctor ?? showDoctorFilter;

    return (
        <div
            className={`
                bg-white rounded-2xl border border-gray-200 shadow-sm
                px-5 py-4 transition-opacity duration-200
                ${isPending ? 'opacity-60 pointer-events-none' : 'opacity-100'}
            `}
            role="search"
            aria-label="Report filters"
        >
            <div className="flex flex-col sm:flex-row sm:flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 shrink-0 pr-2 sm:border-r sm:border-gray-100">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 whitespace-nowrap">
                        Filter By
                    </span>
                </div>

                <div className="flex items-center gap-2 flex-1 min-w-[320px]">
                    <div className="flex items-center gap-2 flex-1">
                        <div className="relative flex-1 min-w-0 group">
                            <label htmlFor="mis-start-date" className="sr-only">Start date</label>
                            <input
                                suppressHydrationWarning
                                id="mis-start-date"
                                type="date"
                                value={startDate}
                                onChange={handleStartDate}
                                onClick={(e) => {
                                    try { e.currentTarget.showPicker(); } catch {}
                                }}
                                max={endDate || undefined}
                                className="w-full text-sm font-semibold text-stone-700 bg-white border border-gray-200 rounded-xl pl-10 pr-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all duration-200 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] hover:border-emerald-300 hover:shadow-md cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-datetime-edit]:py-0"
                            />
                            <CalendarRange className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500/70 group-hover:text-emerald-600 transition-colors pointer-events-none" />
                        </div>
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest shrink-0 px-1">TO</span>
                        <div className="relative flex-1 min-w-0 group">
                            <label htmlFor="mis-end-date" className="sr-only">End date</label>
                            <input
                                suppressHydrationWarning
                                id="mis-end-date"
                                type="date"
                                value={endDate}
                                onChange={handleEndDate}
                                onClick={(e) => {
                                    try { e.currentTarget.showPicker(); } catch {}
                                }}
                                min={startDate || undefined}
                                className="w-full text-sm font-semibold text-stone-700 bg-white border border-gray-200 rounded-xl pl-10 pr-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all duration-200 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] hover:border-emerald-300 hover:shadow-md cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-datetime-edit]:py-0"
                            />
                            <CalendarRange className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500/70 group-hover:text-emerald-600 transition-colors pointer-events-none" />
                        </div>
                    </div>
                </div>

                {shouldShowDoctor && (
                    <div className="flex items-center gap-2 w-full sm:w-56 shrink-0">
                        <UserSearch className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <div className="flex-1">
                            <label htmlFor="mis-doctor-select" className="sr-only">Filter by doctor</label>
                            <select
                                suppressHydrationWarning
                                id="mis-doctor-select"
                                value={doctor}
                                onChange={handleDoctor}
                                className="w-full text-sm font-semibold text-stone-900 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none appearance-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all duration-150 cursor-pointer bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 20 20%22><path stroke=%22%236b7280%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22 stroke-width=%221.5%22 d=%22M6 8l4 4 4-4%22/></svg>')] bg-no-repeat bg-[right_10px_center] bg-[length:16px] pr-8"
                            >
                                <option value="">All Doctors</option>
                                {doctorOptions.map((name) => (
                                    <option key={name} value={name}>{name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}

                {filterSpec?.showDepartment && (
                    <div className="flex items-center gap-2 w-full sm:w-56 shrink-0">
                        <Building2 className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <div className="flex-1">
                            <label htmlFor="mis-dept-select" className="sr-only">Filter by department</label>
                            <select
                                suppressHydrationWarning
                                id="mis-dept-select"
                                value={department}
                                onChange={handleDepartment}
                                className="w-full text-sm font-semibold text-stone-900 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none appearance-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all duration-150 cursor-pointer bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 20 20%22><path stroke=%22%236b7280%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22 stroke-width=%221.5%22 d=%22M6 8l4 4 4-4%22/></svg>')] bg-no-repeat bg-[right_10px_center] bg-[length:16px] pr-8"
                            >
                                <option value="">All Departments</option>
                                {departments.map((d) => (
                                    <option key={d.id} value={d.id}>{d.name || d.id}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}

                {filterSpec?.showBillType && (
                    <div className="flex items-center gap-2 w-full sm:w-48 shrink-0">
                        <CreditCard className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <div className="flex-1">
                            <label htmlFor="mis-bill-type-select" className="sr-only">Filter by bill type</label>
                            <select
                                suppressHydrationWarning
                                id="mis-bill-type-select"
                                value={billType}
                                onChange={handleBillType}
                                className="w-full text-sm font-semibold text-stone-900 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none appearance-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all duration-150 cursor-pointer bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 20 20%22><path stroke=%22%236b7280%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22 stroke-width=%221.5%22 d=%22M6 8l4 4 4-4%22/></svg>')] bg-no-repeat bg-[right_10px_center] bg-[length:16px] pr-8"
                            >
                                <option value="">All Bill Types</option>
                                <option value="Cash">Cash</option>
                                <option value="TPA">TPA</option>
                                <option value="Corporate">Corporate</option>
                            </select>
                        </div>
                    </div>
                )}

                {filterSpec?.showStatus && filterSpec?.statusOptions && (
                    <div className="flex items-center gap-2 w-full sm:w-48 shrink-0">
                        <Activity className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <div className="flex-1">
                            <label htmlFor="mis-status-select" className="sr-only">Filter by status</label>
                            <select
                                suppressHydrationWarning
                                id="mis-status-select"
                                value={statusVal}
                                onChange={handleStatus}
                                className="w-full text-sm font-semibold text-stone-900 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none appearance-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all duration-150 cursor-pointer bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 20 20%22><path stroke=%22%236b7280%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22 stroke-width=%221.5%22 d=%22M6 8l4 4 4-4%22/></svg>')] bg-no-repeat bg-[right_10px_center] bg-[length:16px] pr-8"
                            >
                                <option value="">All Statuses</option>
                                {filterSpec.statusOptions.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}

                {filterSpec?.showStore && (
                    <div className="flex items-center gap-2 w-full sm:w-56 shrink-0">
                        <Store className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <div className="flex-1">
                            <label htmlFor="mis-store-select" className="sr-only">Filter by store</label>
                            <select
                                suppressHydrationWarning
                                id="mis-store-select"
                                value={storeId}
                                onChange={handleStore}
                                className="w-full text-sm font-semibold text-stone-900 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none appearance-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all duration-150 cursor-pointer bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 20 20%22><path stroke=%22%236b7280%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22 stroke-width=%221.5%22 d=%22M6 8l4 4 4-4%22/></svg>')] bg-no-repeat bg-[right_10px_center] bg-[length:16px] pr-8"
                            >
                                <option value="">All Stores</option>
                                {stores.map((s) => (
                                    <option key={s.id} value={s.id}>{s.name || s.id}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}

                {/* Bug 3B fix: Branch dropdown — appears when filterSpec.showBranch is true */}
                {filterSpec?.showBranch && (
                    <div className="flex items-center gap-2 w-full sm:w-56 shrink-0">
                        <GitBranch className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <div className="flex-1">
                            <label htmlFor="mis-branch-select" className="sr-only">Filter by branch</label>
                            <select
                                suppressHydrationWarning
                                id="mis-branch-select"
                                value={branchId}
                                onChange={handleBranch}
                                className="w-full text-sm font-semibold text-stone-900 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none appearance-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all duration-150 cursor-pointer bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 20 20%22><path stroke=%22%236b7280%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22 stroke-width=%221.5%22 d=%22M6 8l4 4 4-4%22/></svg>')] bg-no-repeat bg-[right_10px_center] bg-[length:16px] pr-8"
                            >
                                <option value="">All Branches</option>
                                {branches.map((b) => (
                                    <option key={b.id} value={b.id}>{b.name || b.id}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}

                {/* Bug 3A fix: Service Category dropdown — static list of billing categories.
                     Replaces the clinical showDepartment dropdown for Revenue Service Type reports.
                     These are the actual categories in invoice_items.service_category, NOT
                     clinical departments like Cardiology from the departments master table. */}
                {filterSpec?.showServiceCategory && (
                    <div className="flex items-center gap-2 w-full sm:w-56 shrink-0">
                        <LayoutGrid className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <div className="flex-1">
                            <label htmlFor="mis-svc-cat-select" className="sr-only">Filter by service category</label>
                            <select
                                suppressHydrationWarning
                                id="mis-svc-cat-select"
                                value={serviceCategory}
                                onChange={handleServiceCategory}
                                className="w-full text-sm font-semibold text-stone-900 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none appearance-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all duration-150 cursor-pointer bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 20 20%22><path stroke=%22%236b7280%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22 stroke-width=%221.5%22 d=%22M6 8l4 4 4-4%22/></svg>')] bg-no-repeat bg-[right_10px_center] bg-[length:16px] pr-8"
                            >
                                <option value="">All Categories</option>
                                <option value="Package">Package</option>
                                <option value="Inventory">Inventory</option>
                                <option value="Pharmacy">Pharmacy</option>
                                <option value="Consultation">Consultation</option>
                                <option value="Procedure">Procedure</option>
                                <option value="Lab">Lab</option>
                                <option value="Radiology">Radiology</option>
                                <option value="Bed Charges">Bed Charges</option>
                            </select>
                        </div>
                    </div>
                )}

                {hasActiveFilters && (
                    <button
                        suppressHydrationWarning
                        onClick={handleClear}
                        className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-rose-600 bg-gray-100 hover:bg-rose-50 border border-gray-200 hover:border-rose-200 px-3 py-2 rounded-xl transition-all duration-150 whitespace-nowrap shrink-0"
                        aria-label="Clear all filters"
                    >
                        <X className="h-3 w-3" />
                        Clear
                    </button>
                )}

                {reportId && (
                    <div className="ml-auto flex items-center border-l pl-3 border-gray-100">
                        <MISPresetManager 
                            reportId={reportId} 
                            currentFilters={{
                                startDate, endDate, doctor, department_id: department, bill_type: billType,
                                status: statusVal, store_id: storeId,
                                // Bug 3B/3A fix: include new filter keys in preset snapshots
                                branch_id: branchId, service_category: serviceCategory,
                            }} 
                        />
                    </div>
                )}
            </div>

            {hasActiveFilters && (
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
                    {startDate && <FilterPill label="From" value={formatDisplayDate(startDate)} onRemove={() => pushParam('startDate', '')} />}
                    {endDate && <FilterPill label="To" value={formatDisplayDate(endDate)} onRemove={() => pushParam('endDate', '')} />}
                    {shouldShowDoctor && doctor && <FilterPill label="Doctor" value={doctor} onRemove={() => pushParam('doctor', '')} />}
                    {filterSpec?.showDepartment && department && <FilterPill label="Dept" value={departments.find(d => d.id === department)?.name || department} onRemove={() => pushParam('department_id', '')} />}
                    {filterSpec?.showBillType && billType && <FilterPill label="Bill Type" value={billType} onRemove={() => pushParam('bill_type', '')} />}
                    {filterSpec?.showStatus && statusVal && <FilterPill label="Status" value={statusVal} onRemove={() => pushParam('status', '')} />}
                    {filterSpec?.showStore && storeId && <FilterPill label="Store" value={stores.find(s => s.id === storeId)?.name || storeId} onRemove={() => pushParam('store_id', '')} />}
                    {/* Bug 3B/3A fix: pills for new filter keys */}
                    {filterSpec?.showBranch && branchId && <FilterPill label="Branch" value={branches.find(b => b.id === branchId)?.name || branchId} onRemove={() => pushParam('branch_id', '')} />}
                    {filterSpec?.showServiceCategory && serviceCategory && <FilterPill label="Category" value={serviceCategory} onRemove={() => pushParam('service_category', '')} />}
                </div>
            )}
        </div>
    );
}

function FilterPill({ label, value, onRemove }: { label: string; value: string; onRemove: () => void }) {
    return (
        <span className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold px-2.5 py-1 rounded-full">
            <span className="text-emerald-500">{label}:</span>
            {value}
            <button suppressHydrationWarning onClick={onRemove} className="ml-0.5 text-emerald-400 hover:text-emerald-700 transition-colors" aria-label={`Remove ${label} filter`}>
                <X className="h-2.5 w-2.5" />
            </button>
        </span>
    );
}

function formatDisplayDate(iso: string): string {
    if (!iso) return '';
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
