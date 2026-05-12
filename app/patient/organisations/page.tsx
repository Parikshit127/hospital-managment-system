'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Building2, MapPin, Phone, Search, Stethoscope, Loader2, ArrowRight, Star } from 'lucide-react';

type Org = {
    id: string; name: string; slug: string; address: string | null;
    phone: string | null; logo_url: string | null; hospital_type: string | null;
    specialties: string[]; branding: { primary_color: string; portal_title: string } | null;
};

export default function OrganisationsPage() {
    const [orgs, setOrgs] = useState<Org[]>([]);
    const [filtered, setFiltered] = useState<Org[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/public/organizations').then(r => r.json()).then(d => {
            setOrgs(d.orgs || []);
            setFiltered(d.orgs || []);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (!search.trim()) { setFiltered(orgs); return; }
        const q = search.toLowerCase();
        setFiltered(orgs.filter(o =>
            o.name.toLowerCase().includes(q) ||
            o.address?.toLowerCase().includes(q) ||
            o.hospital_type?.toLowerCase().includes(q) ||
            o.specialties?.some(s => s.toLowerCase().includes(q))
        ));
    }, [search, orgs]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
            {/* Hero */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white py-16 px-4">
                <div className="max-w-4xl mx-auto text-center">
                    <h1 className="text-4xl font-black mb-3">Find Your Hospital</h1>
                    <p className="text-emerald-100 text-lg mb-8">Book appointments, access records, and manage your health</p>
                    <div className="relative max-w-xl mx-auto">
                        <Search className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
                        <input
                            value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Search by hospital name, city, or specialty..."
                            className="w-full pl-12 pr-4 py-4 rounded-2xl text-gray-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-white/50 shadow-lg"
                        />
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 py-10">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-bold text-gray-700">{filtered.length} Organisation{filtered.length !== 1 ? 's' : ''} Found</h2>
                    <Link href="/patient/login" className="text-sm text-emerald-600 font-bold hover:underline">Already registered? Login →</Link>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-20 text-gray-400">
                        <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p>No organisations found</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {filtered.map(org => (
                            <div key={org.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all overflow-hidden">
                                <div className="p-6">
                                    <div className="flex items-start gap-4">
                                        <div className="w-14 h-14 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0 overflow-hidden">
                                            {org.logo_url
                                                ? <img src={org.logo_url} alt={org.name} className="w-full h-full object-cover" />
                                                : <Building2 className="w-7 h-7 text-emerald-600" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-black text-gray-900 text-lg leading-tight">{org.name}</h3>
                                            {org.hospital_type && (
                                                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">{org.hospital_type}</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mt-4 space-y-2">
                                        {org.address && (
                                            <div className="flex items-start gap-2 text-sm text-gray-500">
                                                <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-gray-400" />
                                                <span>{org.address}</span>
                                            </div>
                                        )}
                                        {org.phone && (
                                            <div className="flex items-center gap-2 text-sm text-gray-500">
                                                <Phone className="w-4 h-4 text-gray-400" />
                                                <span>{org.phone}</span>
                                            </div>
                                        )}
                                        {org.specialties?.length > 0 && (
                                            <div className="flex items-start gap-2 text-sm text-gray-500">
                                                <Stethoscope className="w-4 h-4 shrink-0 mt-0.5 text-gray-400" />
                                                <span className="line-clamp-1">{org.specialties.slice(0, 4).join(', ')}{org.specialties.length > 4 ? ` +${org.specialties.length - 4} more` : ''}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="border-t border-gray-100 px-6 py-4 flex gap-3">
                                    <Link href={`/patient/register?org=${org.slug}`}
                                        className="flex-1 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-xl text-center hover:bg-emerald-700 transition">
                                        Register Here
                                    </Link>
                                    <Link href={`/hospital/${org.slug}`}
                                        className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition">
                                        View <ArrowRight className="w-3.5 h-3.5" />
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
