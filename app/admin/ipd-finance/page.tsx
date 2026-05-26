'use client';

import { useState, useEffect, useMemo, Fragment } from 'react';
import {
    getIpdServices, addIpdService, updateIpdService,
    getIpdPackages, addIpdPackage, updateIpdPackage,
} from '@/app/actions/ipd-master-actions';

function parsePackageMeta(desc: string | null | undefined): { category: string | null; isDayCare: boolean; freeText: string } {
    if (!desc) return { category: null, isDayCare: false, freeText: '' };
    try {
        const m = JSON.parse(desc);
        if (m && typeof m === 'object' && 'category' in m) {
            return { category: String(m.category), isDayCare: !!m.is_day_care, freeText: '' };
        }
    } catch {
        // not JSON — treat as plain text description
    }
    return { category: null, isDayCare: false, freeText: desc };
}

function asStringArray(v: unknown): string[] {
    if (Array.isArray(v)) return v.filter((x) => typeof x === 'string') as string[];
    return [];
}

export default function IpdFinanceSetupPage() {
    const [activeTab, setActiveTab] = useState<'services' | 'packages'>('services');
    const [services, setServices] = useState<any[]>([]);
    const [packages, setPackages] = useState<any[]>([]);

    // Service form
    const [showServiceForm, setShowServiceForm] = useState(false);
    const [serviceForm, setServiceForm] = useState({
        service_code: '', service_name: '', service_category: 'Room',
        default_rate: '', hsn_sac_code: '', tax_rate: '0',
    });

    // Package form
    const [showPackageForm, setShowPackageForm] = useState(false);
    const [packageForm, setPackageForm] = useState({
        package_code: '', package_name: '', description: '',
        total_amount: '', validity_days: '7', exclusions: '',
    });

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        const [sRes, pRes] = await Promise.all([getIpdServices(), getIpdPackages()]);
        if (sRes.success) setServices(sRes.data);
        if (pRes.success) setPackages(pRes.data);
    }

    async function handleAddService() {
        if (!serviceForm.service_code || !serviceForm.service_name || !serviceForm.default_rate) return;
        const res = await addIpdService({
            service_code: serviceForm.service_code,
            service_name: serviceForm.service_name,
            service_category: serviceForm.service_category,
            default_rate: parseFloat(serviceForm.default_rate),
            hsn_sac_code: serviceForm.hsn_sac_code || undefined,
            tax_rate: parseFloat(serviceForm.tax_rate) || 0,
        });
        if (res.success) {
            setShowServiceForm(false);
            setServiceForm({ service_code: '', service_name: '', service_category: 'Room', default_rate: '', hsn_sac_code: '', tax_rate: '0' });
            loadData();
        }
    }

    async function handleAddPackage() {
        if (!packageForm.package_code || !packageForm.package_name || !packageForm.total_amount) return;
        const res = await addIpdPackage({
            package_code: packageForm.package_code,
            package_name: packageForm.package_name,
            description: packageForm.description || undefined,
            total_amount: parseFloat(packageForm.total_amount),
            validity_days: parseInt(packageForm.validity_days) || 7,
            inclusions: [],
            exclusions: packageForm.exclusions || undefined,
        });
        if (res.success) {
            setShowPackageForm(false);
            setPackageForm({ package_code: '', package_name: '', description: '', total_amount: '', validity_days: '7', exclusions: '' });
            loadData();
        }
    }

    async function toggleServiceActive(id: number, currentActive: boolean) {
        await updateIpdService(id, { is_active: !currentActive });
        loadData();
    }

    const categories = ['Room', 'Nursing', 'DoctorVisit', 'Procedure', 'Consumable', 'Pharmacy', 'Lab', 'Diet', 'Misc'];

    const [showInclusions, setShowInclusions] = useState(false);

    const groupedPackages = useMemo(() => {
        const groups: Record<string, any[]> = {};
        for (const p of packages) {
            const meta = parsePackageMeta(p.description);
            const cat = meta.category || 'Uncategorized';
            (groups[cat] ??= []).push({ ...p, _meta: meta });
        }
        return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    }, [packages]);

    const globalInclusions = useMemo(() => {
        const p = packages.find((x: any) => asStringArray(x.inclusions).length > 0);
        return p ? asStringArray(p.inclusions) : [];
    }, [packages]);

    const globalExclusions = useMemo(() => {
        const p = packages.find((x: any) => asStringArray(x.exclusions).length > 0);
        return p ? asStringArray(p.exclusions) : [];
    }, [packages]);

    const dayCareCount = useMemo(
        () => packages.filter((p: any) => parsePackageMeta(p.description).isDayCare).length,
        [packages],
    );

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-6xl mx-auto">
                <h1 className="text-2xl font-bold text-gray-900 mb-6">IPD Finance Setup</h1>

                {/* Tabs */}
                <div className="flex border-b mb-6">
                    {(['services', 'packages'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-6 py-3 text-sm font-medium border-b-2 ${
                                activeTab === tab ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-gray-500'
                            }`}
                        >
                            {tab === 'services' ? 'Service Master' : 'Packages'}
                        </button>
                    ))}
                </div>

                {/* Services Tab */}
                {activeTab === 'services' && (
                    <div className="bg-white rounded-lg shadow">
                        <div className="p-4 flex justify-between items-center border-b">
                            <h2 className="font-semibold">IPD Services & Charges</h2>
                            <button
                                onClick={() => setShowServiceForm(!showServiceForm)}
                                className="px-4 py-2 bg-emerald-600 text-white rounded-md text-sm"
                            >
                                + Add Service
                            </button>
                        </div>

                        {showServiceForm && (
                            <div className="p-4 bg-gray-50 border-b">
                                <div className="grid grid-cols-6 gap-3">
                                    <input placeholder="Code" value={serviceForm.service_code}
                                        onChange={(e) => setServiceForm({...serviceForm, service_code: e.target.value})}
                                        className="px-3 py-2 border rounded-md text-sm" />
                                    <input placeholder="Service Name" value={serviceForm.service_name}
                                        onChange={(e) => setServiceForm({...serviceForm, service_name: e.target.value})}
                                        className="px-3 py-2 border rounded-md text-sm" />
                                    <select value={serviceForm.service_category}
                                        onChange={(e) => setServiceForm({...serviceForm, service_category: e.target.value})}
                                        className="px-3 py-2 border rounded-md text-sm">
                                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                    <input placeholder="Rate (₹)" type="number" value={serviceForm.default_rate}
                                        onChange={(e) => setServiceForm({...serviceForm, default_rate: e.target.value})}
                                        className="px-3 py-2 border rounded-md text-sm" />
                                    <input placeholder="SAC/HSN" value={serviceForm.hsn_sac_code}
                                        onChange={(e) => setServiceForm({...serviceForm, hsn_sac_code: e.target.value})}
                                        className="px-3 py-2 border rounded-md text-sm" />
                                    <div className="flex gap-2">
                                        <input placeholder="GST%" type="number" value={serviceForm.tax_rate}
                                            onChange={(e) => setServiceForm({...serviceForm, tax_rate: e.target.value})}
                                            className="px-3 py-2 border rounded-md text-sm w-20" />
                                        <button onClick={handleAddService} className="px-4 py-2 bg-emerald-600 text-white rounded-md text-sm">Save</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 text-left">
                                    <th className="p-3">Code</th>
                                    <th className="p-3">Service Name</th>
                                    <th className="p-3">Category</th>
                                    <th className="p-3 text-right">Rate (₹)</th>
                                    <th className="p-3">SAC/HSN</th>
                                    <th className="p-3 text-right">GST%</th>
                                    <th className="p-3">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {services.map((s: any) => (
                                    <tr key={s.id} className="border-b hover:bg-gray-50">
                                        <td className="p-3 font-mono text-xs">{s.service_code}</td>
                                        <td className="p-3">{s.service_name}</td>
                                        <td className="p-3"><span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">{s.service_category}</span></td>
                                        <td className="p-3 text-right">{Number(s.default_rate).toLocaleString('en-IN')}</td>
                                        <td className="p-3 text-xs">{s.hsn_sac_code || '-'}</td>
                                        <td className="p-3 text-right">{Number(s.tax_rate)}%</td>
                                        <td className="p-3">
                                            <button onClick={() => toggleServiceActive(s.id, s.is_active)}
                                                className={`px-2 py-0.5 rounded text-xs ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {s.is_active ? 'Active' : 'Inactive'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {services.length === 0 && (
                                    <tr><td colSpan={7} className="p-8 text-center text-gray-400">No services configured yet</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Packages Tab */}
                {activeTab === 'packages' && (
                    <div className="bg-white rounded-lg shadow">
                        <div className="p-4 flex justify-between items-center border-b">
                            <h2 className="font-semibold">Clinical Packages</h2>
                            <button
                                onClick={() => setShowPackageForm(!showPackageForm)}
                                className="px-4 py-2 bg-emerald-600 text-white rounded-md text-sm"
                            >
                                + Add Package
                            </button>
                        </div>

                        {showPackageForm && (
                            <div className="p-4 bg-gray-50 border-b">
                                <div className="grid grid-cols-3 gap-3 mb-3">
                                    <input placeholder="Package Code" value={packageForm.package_code}
                                        onChange={(e) => setPackageForm({...packageForm, package_code: e.target.value})}
                                        className="px-3 py-2 border rounded-md text-sm" />
                                    <input placeholder="Package Name" value={packageForm.package_name}
                                        onChange={(e) => setPackageForm({...packageForm, package_name: e.target.value})}
                                        className="px-3 py-2 border rounded-md text-sm" />
                                    <input placeholder="Total Amount (₹)" type="number" value={packageForm.total_amount}
                                        onChange={(e) => setPackageForm({...packageForm, total_amount: e.target.value})}
                                        className="px-3 py-2 border rounded-md text-sm" />
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    <input placeholder="Description" value={packageForm.description}
                                        onChange={(e) => setPackageForm({...packageForm, description: e.target.value})}
                                        className="px-3 py-2 border rounded-md text-sm" />
                                    <input placeholder="Validity (days)" type="number" value={packageForm.validity_days}
                                        onChange={(e) => setPackageForm({...packageForm, validity_days: e.target.value})}
                                        className="px-3 py-2 border rounded-md text-sm" />
                                    <button onClick={handleAddPackage} className="px-4 py-2 bg-emerald-600 text-white rounded-md text-sm">Save Package</button>
                                </div>
                            </div>
                        )}

                        {/* Summary strip */}
                        {packages.length > 0 && (
                            <div className="px-4 py-3 bg-emerald-50 border-b flex items-center gap-6 text-xs">
                                <span className="text-gray-700">
                                    <strong className="text-emerald-800">{packages.length}</strong> packages
                                </span>
                                <span className="text-gray-700">
                                    <strong className="text-emerald-800">{groupedPackages.length}</strong> categories
                                </span>
                                <span className="text-gray-700">
                                    <strong className="text-emerald-800">{dayCareCount}</strong> day-care procedures
                                </span>
                            </div>
                        )}

                        {/* Global Inclusions / Exclusions panel */}
                        {(globalInclusions.length > 0 || globalExclusions.length > 0) && (
                            <div className="border-b">
                                <button
                                    onClick={() => setShowInclusions((v) => !v)}
                                    className="w-full px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-between"
                                >
                                    <span>📋 Package Inclusions &amp; Exclusions (applies to all packages)</span>
                                    <span className="text-gray-400 text-xs">{showInclusions ? '▼ Hide' : '▶ Show'}</span>
                                </button>
                                {showInclusions && (
                                    <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                        <div>
                                            <div className="font-semibold text-green-700 mb-2">✓ Included</div>
                                            <ul className="space-y-1 text-gray-700">
                                                {globalInclusions.map((i, idx) => (
                                                    <li key={idx} className="flex gap-2">
                                                        <span className="text-green-600">•</span>
                                                        <span>{i}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                        <div>
                                            <div className="font-semibold text-red-700 mb-2">✗ Excluded</div>
                                            <ul className="space-y-1 text-gray-700">
                                                {globalExclusions.map((e, idx) => (
                                                    <li key={idx} className="flex gap-2">
                                                        <span className="text-red-600">•</span>
                                                        <span>{e}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 text-left">
                                    <th className="p-3">Code</th>
                                    <th className="p-3">Package Name</th>
                                    <th className="p-3">Notes</th>
                                    <th className="p-3 text-right">Amount (₹)</th>
                                    <th className="p-3 text-right">Validity</th>
                                    <th className="p-3">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {groupedPackages.map(([category, rows]) => (
                                    <Fragment key={category}>
                                        <tr className="bg-emerald-50/60">
                                            <td colSpan={6} className="p-2 px-3 text-xs font-semibold text-emerald-800 uppercase tracking-wide">
                                                {category} <span className="text-emerald-600 font-normal normal-case">({rows.length})</span>
                                            </td>
                                        </tr>
                                        {rows.map((p: any) => (
                                            <tr key={p.id} className="border-b hover:bg-gray-50">
                                                <td className="p-3 font-mono text-xs">{p.package_code}</td>
                                                <td className="p-3 font-medium">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span>{p.package_name}</span>
                                                        {p._meta.isDayCare && (
                                                            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-semibold">DAY CARE</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-3 text-gray-500 text-xs">{p._meta.freeText || '-'}</td>
                                                <td className="p-3 text-right font-semibold">₹{Number(p.total_amount).toLocaleString('en-IN')}</td>
                                                <td className="p-3 text-right">{p.validity_days} days</td>
                                                <td className="p-3">
                                                    <span className={`px-2 py-0.5 rounded text-xs ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                        {p.is_active ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </Fragment>
                                ))}
                                {packages.length === 0 && (
                                    <tr><td colSpan={6} className="p-8 text-center text-gray-400">No packages configured yet</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
