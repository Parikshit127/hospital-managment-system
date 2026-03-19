'use client';

import { useState, useEffect } from 'react';
import { getVendors, addVendor, updateVendor } from '@/app/actions/expense-actions';
import { Search, Plus, Building2, Phone, Mail, MapPin, AlertCircle, Edit2, ToggleLeft, ToggleRight } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';

export default function VendorsPage() {
    const [vendors, setVendors] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showAdd, setShowAdd] = useState(false);
    const [editVendor, setEditVendor] = useState<any>(null);
    const [showAll, setShowAll] = useState(false);

    useEffect(() => { loadVendors(); }, [showAll]);

    async function loadVendors() {
        setLoading(true);
        const res = await getVendors(!showAll);
        if (res.success) setVendors(res.data);
        setLoading(false);
    }

    const filtered = vendors.filter(v =>
        !search || v.vendor_name.toLowerCase().includes(search.toLowerCase()) ||
        v.vendor_code.toLowerCase().includes(search.toLowerCase()) ||
        v.gst_number?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <AppShell pageTitle="Vendor Management" pageIcon={<Building2 className="h-5 w-5" />} onRefresh={loadVendors} refreshing={loading}>
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Vendor Management</h1>
                    <p className="text-sm text-gray-500 mt-1">Manage suppliers and service providers</p>
                </div>
                <button onClick={() => setShowAdd(true)} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition flex items-center gap-2">
                    <Plus className="h-4 w-4" /> Add Vendor
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input type="text" placeholder="Search vendors by name, code, or GST..." value={search} onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" />
                </div>
                <button onClick={() => setShowAll(!showAll)}
                    className="px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-2">
                    {showAll ? <ToggleRight className="h-4 w-4 text-emerald-600" /> : <ToggleLeft className="h-4 w-4 text-gray-400" />}
                    {showAll ? 'Show All' : 'Active Only'}
                </button>
            </div>

            {/* Vendor Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map(vendor => (
                    <div key={vendor.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition">
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center">
                                    <Building2 className="h-5 w-5 text-emerald-600" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900">{vendor.vendor_name}</h3>
                                    <p className="text-xs text-gray-500 font-mono">{vendor.vendor_code}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${vendor.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                                    {vendor.is_active ? 'Active' : 'Inactive'}
                                </span>
                                <button onClick={() => setEditVendor(vendor)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                                    <Edit2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>

                        <div className="space-y-1.5 text-sm text-gray-600">
                            {vendor.contact_person && <p className="text-gray-700 font-medium">{vendor.contact_person}</p>}
                            {vendor.phone && <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-gray-400" />{vendor.phone}</p>}
                            {vendor.email && <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-gray-400" />{vendor.email}</p>}
                            {vendor.gst_number && <p className="text-xs text-gray-500">GST: {vendor.gst_number}</p>}
                            {vendor.pan_number && <p className="text-xs text-gray-500">PAN: {vendor.pan_number}</p>}
                        </div>

                        {vendor._count?.expenses > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                                <p className="text-xs text-gray-400">{vendor._count.expenses} expense{vendor._count.expenses > 1 ? 's' : ''} recorded</p>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {filtered.length === 0 && !loading && (
                <div className="text-center py-16">
                    <Building2 className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                    <p className="font-medium text-gray-500">No vendors found</p>
                    <p className="text-sm text-gray-400 mt-1">Add vendors to track expenses against them</p>
                </div>
            )}

            {/* Add / Edit Modal */}
            {(showAdd || editVendor) && (
                <VendorModal
                    vendor={editVendor}
                    onClose={() => { setShowAdd(false); setEditVendor(null); }}
                    onSave={async (data) => {
                        let res;
                        if (editVendor) {
                            res = await updateVendor(editVendor.id, data);
                        } else {
                            res = await addVendor(data);
                        }
                        if (res.success) { setShowAdd(false); setEditVendor(null); loadVendors(); }
                        return res;
                    }}
                />
            )}
        </div>
        </AppShell>
    );
}

function VendorModal({ vendor, onClose, onSave }: {
    vendor?: any; onClose: () => void; onSave: (data: any) => Promise<any>;
}) {
    const [form, setForm] = useState({
        vendor_name: vendor?.vendor_name || '',
        vendor_code: vendor?.vendor_code || '',
        contact_person: vendor?.contact_person || '',
        phone: vendor?.phone || '',
        email: vendor?.email || '',
        gst_number: vendor?.gst_number || '',
        pan_number: vendor?.pan_number || '',
        bank_name: vendor?.bank_name || '',
        bank_account: vendor?.bank_account || '',
        bank_ifsc: vendor?.bank_ifsc || '',
        address: vendor?.address || '',
        is_active: vendor?.is_active ?? true,
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.vendor_name || (!vendor && !form.vendor_code)) {
            setError('Vendor name and code are required');
            return;
        }
        setSaving(true);
        setError('');
        const res = await onSave(form);
        if (!res.success) setError(res.error || 'Failed to save vendor');
        setSaving(false);
    }

    const fieldClass = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-gray-900">{vendor ? 'Edit Vendor' : 'Add Vendor'}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Name *</label>
                            <input type="text" value={form.vendor_name} onChange={e => setForm({ ...form, vendor_name: e.target.value })} className={fieldClass} placeholder="Company name" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Code {!vendor ? '*' : ''}</label>
                            <input type="text" value={form.vendor_code} onChange={e => setForm({ ...form, vendor_code: e.target.value })}
                                className={fieldClass} placeholder="e.g. VEN-001" disabled={!!vendor} />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person</label>
                        <input type="text" value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })} className={fieldClass} />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                            <input type="text" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={fieldClass} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={fieldClass} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">GSTIN</label>
                            <input type="text" value={form.gst_number} onChange={e => setForm({ ...form, gst_number: e.target.value })} className={fieldClass} placeholder="22AAAAA0000A1Z5" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">PAN</label>
                            <input type="text" value={form.pan_number} onChange={e => setForm({ ...form, pan_number: e.target.value })} className={fieldClass} placeholder="AAAPL1234C" />
                        </div>
                    </div>

                    <div className="border-t border-gray-100 pt-4">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">Bank Details</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name</label>
                                <input type="text" value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} className={fieldClass} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">IFSC Code</label>
                                <input type="text" value={form.bank_ifsc} onChange={e => setForm({ ...form, bank_ifsc: e.target.value })} className={fieldClass} />
                            </div>
                        </div>
                        <div className="mt-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Account Number</label>
                            <input type="text" value={form.bank_account} onChange={e => setForm({ ...form, bank_account: e.target.value })} className={fieldClass} />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                        <textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} rows={2} className={fieldClass} />
                    </div>

                    {vendor && (
                        <div className="flex items-center gap-2">
                            <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })}
                                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                            <label className="text-sm text-gray-700">Active</label>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
                        <button type="submit" disabled={saving} className="px-6 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                            {saving ? 'Saving...' : vendor ? 'Update Vendor' : 'Add Vendor'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
