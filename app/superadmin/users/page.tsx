'use client';

import React, { useEffect, useState } from 'react';
import { Users, Search, Building2, ShieldCheck, Mail, Phone, CalendarClock } from 'lucide-react';
import { getOrganizationUsers } from '@/app/actions/superadmin-actions';
import Link from 'next/link';

export default function GlobalUsersPage() {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const loadData = async () => {
        setLoading(true);
        const res = await getOrganizationUsers(undefined, search);
        if (res.success) setUsers(res.data);
        setLoading(false);
    };

    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            loadData();
        }, 500);
        return () => clearTimeout(delayDebounceFn);
    }, [search]);

    return (
        <div className="space-y-8">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-gray-900">Platform Users</h1>
                    <p className="text-gray-500 font-medium mt-1">Search and audit human capital across all tenant deployments.</p>
                </div>
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search user by name, email, or handle..."
                        className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl bg-white shadow-sm outline-none focus:ring-2 focus:ring-violet-500/20 text-sm font-medium"
                    />
                </div>
            </header>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    {loading ? (
                        <div className="p-16 text-center text-gray-400">Loading user matrix...</div>
                    ) : users.length === 0 ? (
                        <div className="p-16 text-center text-gray-500 flex flex-col items-center">
                            <Users className="h-10 w-10 text-gray-300 mb-3" />
                            <p className="font-bold text-lg">No identities matched query.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 text-[10px] uppercase font-bold tracking-widest">
                                <tr>
                                    <th className="px-6 py-4">Auth Identity</th>
                                    <th className="px-6 py-4">Role / Scope</th>
                                    <th className="px-6 py-4">Contact Vector</th>
                                    <th className="px-6 py-4">Tenant Host</th>
                                    <th className="px-6 py-4">Provisioned</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {users.map(u => (
                                    <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <p className="font-black text-gray-900">{u.name || 'N/A'}</p>
                                            <p className="text-xs font-mono font-bold text-violet-600">@{u.username}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 text-[10px] rounded-lg font-bold uppercase tracking-widest ${u.role === 'admin' ? 'bg-violet-100 text-violet-700' :
                                                    u.role === 'doctor' ? 'bg-emerald-100 text-emerald-700' :
                                                        'bg-gray-100 text-gray-700'
                                                }`}>
                                                {u.role}
                                            </span>
                                            {u.specialty && <p className="text-xs mt-1 text-gray-500 font-medium">{u.specialty}</p>}
                                        </td>
                                        <td className="px-6 py-4">
                                            {u.email && <div className="flex items-center gap-1.5 text-xs text-gray-600"><Mail className="h-3 w-3" /> {u.email}</div>}
                                            {u.phone && <div className="flex items-center gap-1.5 text-xs text-gray-600 mt-1"><Phone className="h-3 w-3" /> {u.phone}</div>}
                                        </td>
                                        <td className="px-6 py-4">
                                            <Link href={`/superadmin/organizations/${u.organizationId}`} className="flex items-center gap-2 group cursor-pointer inline-flex">
                                                <Building2 className="h-4 w-4 text-gray-400 group-hover:text-violet-600 transition-colors" />
                                                <div>
                                                    <p className="text-sm font-bold text-gray-900 group-hover:text-violet-600 transition-colors">{u.organization?.name}</p>
                                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{u.organization?.code}</p>
                                                </div>
                                            </Link>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                                                <CalendarClock className="h-3.5 w-3.5" />
                                                {new Date(u.createdAt).toLocaleDateString()}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
