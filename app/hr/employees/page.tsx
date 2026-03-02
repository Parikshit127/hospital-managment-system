'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import {
    Users, Search, Plus, Loader2, AlertCircle,
    ChevronLeft, ChevronRight, Filter, UserX
} from 'lucide-react';
import { getEmployeeList } from '@/app/actions/hr-actions';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Employee {
    id: number;
    employee_code: string;
    name: string;
    designation: string;
    email: string | null;
    phone: string | null;
    is_active: boolean;
}

export default function EmployeeListPage() {
    const router = useRouter();
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [search, setSearch] = useState('');
    const [designation, setDesignation] = useState('');
    const [isActive, setIsActive] = useState<boolean | undefined>(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [total, setTotal] = useState(0);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const res = await getEmployeeList({
                search: search || undefined,
                designation: designation || undefined,
                isActive,
                page,
                limit: 25,
            });
            if (res.success) {
                setEmployees(res.data as Employee[]);
                setTotalPages(res.totalPages);
                setTotal(res.total);
            } else {
                setError(true);
            }
        } catch {
            setError(true);
        }
        setLoading(false);
    }, [search, designation, isActive, page]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        loadData();
    };

    return (
        <AppShell
            pageTitle="Employees"
            pageIcon={<Users className="h-5 w-5" />}
            onRefresh={loadData}
            refreshing={loading}
            headerActions={
                <Link
                    href="/hr/employees/new"
                    className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl px-4 py-2 flex items-center gap-2 text-sm hover:shadow-lg hover:shadow-teal-500/20 transition-all"
                >
                    <Plus className="h-4 w-4" />
                    Add Employee
                </Link>
            }
        >
            {/* Filters */}
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4 mb-6">
                <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by name, code, or email..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                        />
                    </div>
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Filter by designation..."
                            value={designation}
                            onChange={(e) => setDesignation(e.target.value)}
                            className="w-full sm:w-48 pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => { setIsActive(isActive === true ? undefined : isActive === undefined ? false : true); setPage(1); }}
                            className={`px-4 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                                isActive === true ? 'bg-green-50 border-green-300 text-green-700' :
                                isActive === false ? 'bg-red-50 border-red-300 text-red-700' :
                                'bg-gray-50 border-gray-200 text-gray-600'
                            }`}
                        >
                            {isActive === true ? 'Active' : isActive === false ? 'Inactive' : 'All'}
                        </button>
                        <button
                            type="submit"
                            className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl px-5 py-2.5 text-sm hover:shadow-lg transition-shadow"
                        >
                            Search
                        </button>
                    </div>
                </form>
            </div>

            {/* Table */}
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
                        <span className="ml-3 text-gray-500 font-medium">Loading employees...</span>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
                        <p className="text-gray-600 font-bold">Failed to load employees</p>
                        <button onClick={loadData} className="mt-3 text-sm text-teal-600 font-bold hover:underline">Retry</button>
                    </div>
                ) : employees.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <UserX className="h-12 w-12 text-gray-300 mb-4" />
                        <p className="text-gray-500 font-bold">No employees found</p>
                        <p className="text-sm text-gray-400 mt-1">Try adjusting your filters or add a new employee</p>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100 bg-gray-50/50">
                                        <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Name</th>
                                        <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Code</th>
                                        <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Designation</th>
                                        <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Email</th>
                                        <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Phone</th>
                                        <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {employees.map((emp) => (
                                        <tr
                                            key={emp.id}
                                            onClick={() => router.push(`/hr/employees/${emp.id}`)}
                                            className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                                        >
                                            <td className="px-4 py-3 font-bold text-gray-900">{emp.name}</td>
                                            <td className="px-4 py-3 text-gray-600 font-mono text-xs">{emp.employee_code}</td>
                                            <td className="px-4 py-3 text-gray-600">{emp.designation}</td>
                                            <td className="px-4 py-3 text-gray-500">{emp.email || '-'}</td>
                                            <td className="px-4 py-3 text-gray-500">{emp.phone || '-'}</td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                    emp.is_active
                                                        ? 'bg-green-100 text-green-700'
                                                        : 'bg-red-100 text-red-700'
                                                }`}>
                                                    {emp.is_active ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/30">
                            <p className="text-xs text-gray-500 font-medium">
                                Showing {((page - 1) * 25) + 1} to {Math.min(page * 25, total)} of {total} employees
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setPage(Math.max(1, page - 1))}
                                    disabled={page <= 1}
                                    className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronLeft className="h-4 w-4 text-gray-600" />
                                </button>
                                <span className="text-sm font-bold text-gray-700 px-2">
                                    {page} / {totalPages || 1}
                                </span>
                                <button
                                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                                    disabled={page >= totalPages}
                                    className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronRight className="h-4 w-4 text-gray-600" />
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </AppShell>
    );
}
