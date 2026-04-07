'use client';

import { useState, useEffect } from 'react';
import { getChargeCatalog, addCatalogItem, updateCatalogItem } from '@/app/actions/finance-actions';
import { getIpdServices, addIpdService, getTariffRates, addTariffRate, getIpdPackages, addIpdPackage, updateIpdPackage } from '@/app/actions/ipd-master-actions';
import { getLabTestPricing, updateLabTestPrice, getPharmacyPricing, updateMedicinePrice, getDoctorFees, updateDoctorFee, getWardPricing, updateWardPricing } from '@/app/actions/master-data-actions';
import { getTaxConfigs, addTaxConfig, updateTaxConfig } from '@/app/actions/tax-actions';

type Tab = 'catalog' | 'ipd-services' | 'packages' | 'lab' | 'pharmacy' | 'doctors' | 'wards' | 'tax';

const TABS: { key: Tab; label: string }[] = [
    { key: 'catalog', label: 'Service Catalog' },
    { key: 'ipd-services', label: 'IPD Services' },
    { key: 'packages', label: 'IPD Packages' },
    { key: 'lab', label: 'Lab Pricing' },
    { key: 'pharmacy', label: 'Pharmacy Pricing' },
    { key: 'doctors', label: 'Doctor Fees' },
    { key: 'wards', label: 'Ward Charges' },
    { key: 'tax', label: 'Tax/GST Config' },
];

const CATEGORIES = ['Room', 'Nursing', 'Consultation', 'Procedure', 'Consumable', 'Lab', 'Pharmacy', 'Diet', 'Misc'];

export default function FinanceMasterPage() {
    const [activeTab, setActiveTab] = useState<Tab>('catalog');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    function showToast(message: string, type: 'success' | 'error' = 'success') {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    }

    return (
        <div className="min-h-screen bg-gray-50 p-4">
            <div className="max-w-7xl mx-auto">
                <h1 className="text-2xl font-bold text-gray-900 mb-1">Finance Master Data</h1>
                <p className="text-sm text-gray-500 mb-4">Configure pricing, services, taxes, and catalog items</p>

                {/* Tab Bar */}
                <div className="flex border-b bg-white rounded-t-lg overflow-x-auto">
                    {TABS.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                                activeTab === tab.key
                                    ? 'border-emerald-500 text-emerald-700 bg-emerald-50'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="bg-white rounded-b-lg shadow p-4">
                    {activeTab === 'catalog' && <CatalogTab showToast={showToast} />}
                    {activeTab === 'ipd-services' && <IpdServicesTab showToast={showToast} />}
                    {activeTab === 'packages' && <PackagesTab showToast={showToast} />}
                    {activeTab === 'lab' && <LabPricingTab showToast={showToast} />}
                    {activeTab === 'pharmacy' && <PharmacyPricingTab showToast={showToast} />}
                    {activeTab === 'doctors' && <DoctorFeesTab showToast={showToast} />}
                    {activeTab === 'wards' && <WardChargesTab showToast={showToast} />}
                    {activeTab === 'tax' && <TaxConfigTab showToast={showToast} />}
                </div>

                {/* Toast */}
                {toast && (
                    <div className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg text-white text-sm z-50 ${
                        toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
                    }`}>
                        {toast.message}
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================
// TAB 1: SERVICE CATALOG
// ============================================
function CatalogTab({ showToast }: { showToast: (m: string, t?: 'success' | 'error') => void }) {
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [filterCategory, setFilterCategory] = useState('');
    const [form, setForm] = useState({ category: 'Misc', item_code: '', item_name: '', default_price: '', department: '' });

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        setLoading(true);
        const res = await getChargeCatalog(filterCategory || undefined);
        if (res.success) setItems(res.data);
        setLoading(false);
    }

    useEffect(() => { loadData(); }, [filterCategory]);

    async function handleAdd() {
        if (!form.item_code || !form.item_name || !form.default_price) return;
        const res = await addCatalogItem({
            category: form.category,
            item_code: form.item_code,
            item_name: form.item_name,
            default_price: parseFloat(form.default_price),
            department: form.department || undefined,
        });
        if (res.success) {
            showToast('Catalog item added');
            setShowForm(false);
            setForm({ category: 'Misc', item_code: '', item_name: '', default_price: '', department: '' });
            loadData();
        } else showToast(res.error || 'Failed', 'error');
    }

    async function toggleActive(id: number, current: boolean) {
        await updateCatalogItem(id, { is_active: !current });
        loadData();
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <div className="flex gap-2 items-center">
                    <select className="border rounded px-3 py-1.5 text-sm" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                        <option value="">All Categories</option>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <span className="text-sm text-gray-500">{items.length} items</span>
                </div>
                <button onClick={() => setShowForm(!showForm)} className="bg-emerald-600 text-white px-4 py-1.5 rounded text-sm hover:bg-emerald-700">
                    + Add Item
                </button>
            </div>

            {showForm && (
                <div className="border rounded-lg p-4 mb-4 bg-gray-50 grid grid-cols-5 gap-3">
                    <select className="border rounded px-2 py-1.5 text-sm" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input className="border rounded px-2 py-1.5 text-sm" placeholder="Item Code" value={form.item_code} onChange={e => setForm({ ...form, item_code: e.target.value })} />
                    <input className="border rounded px-2 py-1.5 text-sm" placeholder="Item Name" value={form.item_name} onChange={e => setForm({ ...form, item_name: e.target.value })} />
                    <input className="border rounded px-2 py-1.5 text-sm" placeholder="Price" type="number" value={form.default_price} onChange={e => setForm({ ...form, default_price: e.target.value })} />
                    <button onClick={handleAdd} className="bg-emerald-600 text-white rounded text-sm hover:bg-emerald-700">Save</button>
                </div>
            )}

            {loading ? <p className="text-gray-400 text-center py-8">Loading...</p> : (
                <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50 text-left">
                        <th className="p-2">Code</th><th className="p-2">Name</th><th className="p-2">Category</th>
                        <th className="p-2">Dept</th><th className="p-2 text-right">Price</th><th className="p-2">HSN/SAC</th>
                        <th className="p-2 text-right">GST%</th><th className="p-2">Active</th>
                    </tr></thead>
                    <tbody>
                        {items.map((item: any) => (
                            <tr key={item.id} className="border-b hover:bg-gray-50">
                                <td className="p-2 font-mono text-xs">{item.item_code}</td>
                                <td className="p-2">{item.item_name}</td>
                                <td className="p-2"><span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{item.category}</span></td>
                                <td className="p-2 text-gray-500">{item.department || '-'}</td>
                                <td className="p-2 text-right font-medium">{Number(item.default_price).toLocaleString('en-IN')}</td>
                                <td className="p-2 text-gray-500">{item.hsn_sac_code || '-'}</td>
                                <td className="p-2 text-right">{item.tax_rate ? `${Number(item.tax_rate)}%` : '-'}</td>
                                <td className="p-2">
                                    <button onClick={() => toggleActive(item.id, item.is_active)} className={`px-2 py-0.5 rounded text-xs ${item.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {item.is_active ? 'Active' : 'Inactive'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

// ============================================
// TAB 2: IPD SERVICES & TARIFFS
// ============================================
function IpdServicesTab({ showToast }: { showToast: (m: string, t?: 'success' | 'error') => void }) {
    const [services, setServices] = useState<any[]>([]);
    const [tariffs, setTariffs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [selectedService, setSelectedService] = useState<number | null>(null);
    const [form, setForm] = useState({ service_code: '', service_name: '', service_category: 'Consultation', default_rate: '', hsn_sac_code: '', tax_rate: '0' });
    const [tariffForm, setTariffForm] = useState({ tariff_category: 'General', rate: '' });

    useEffect(() => { loadServices(); }, []);

    async function loadServices() {
        setLoading(true);
        const res = await getIpdServices();
        if (res.success) setServices(res.data);
        setLoading(false);
    }

    async function loadTariffs(serviceId: number) {
        setSelectedService(serviceId);
        const res = await getTariffRates(serviceId);
        if (res.success) setTariffs(res.data);
    }

    async function handleAddService() {
        if (!form.service_code || !form.service_name || !form.default_rate) return;
        const res = await addIpdService({
            service_code: form.service_code,
            service_name: form.service_name,
            service_category: form.service_category,
            default_rate: parseFloat(form.default_rate),
            hsn_sac_code: form.hsn_sac_code || undefined,
            tax_rate: parseFloat(form.tax_rate) || 0,
        });
        if (res.success) {
            showToast('IPD Service added');
            setShowForm(false);
            setForm({ service_code: '', service_name: '', service_category: 'Consultation', default_rate: '', hsn_sac_code: '', tax_rate: '0' });
            loadServices();
        } else showToast(res.error || 'Failed', 'error');
    }

    async function handleAddTariff() {
        if (!selectedService || !tariffForm.rate) return;
        const res = await addTariffRate({
            service_id: selectedService,
            tariff_category: tariffForm.tariff_category,
            rate: parseFloat(tariffForm.rate),
        });
        if (res.success) {
            showToast('Tariff rate added');
            setTariffForm({ tariff_category: 'General', rate: '' });
            loadTariffs(selectedService);
        } else showToast(res.error || 'Failed', 'error');
    }

    return (
        <div className="grid grid-cols-2 gap-4">
            <div>
                <div className="flex justify-between items-center mb-3">
                    <h3 className="font-semibold text-sm">IPD Services</h3>
                    <button onClick={() => setShowForm(!showForm)} className="bg-emerald-600 text-white px-3 py-1 rounded text-xs hover:bg-emerald-700">+ Add</button>
                </div>
                {showForm && (
                    <div className="border rounded p-3 mb-3 bg-gray-50 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                            <input className="border rounded px-2 py-1 text-sm" placeholder="Code" value={form.service_code} onChange={e => setForm({ ...form, service_code: e.target.value })} />
                            <input className="border rounded px-2 py-1 text-sm" placeholder="Name" value={form.service_name} onChange={e => setForm({ ...form, service_name: e.target.value })} />
                            <input className="border rounded px-2 py-1 text-sm" placeholder="Rate" type="number" value={form.default_rate} onChange={e => setForm({ ...form, default_rate: e.target.value })} />
                            <input className="border rounded px-2 py-1 text-sm" placeholder="HSN/SAC" value={form.hsn_sac_code} onChange={e => setForm({ ...form, hsn_sac_code: e.target.value })} />
                        </div>
                        <button onClick={handleAddService} className="bg-emerald-600 text-white px-3 py-1 rounded text-xs w-full">Save Service</button>
                    </div>
                )}
                {loading ? <p className="text-gray-400 text-center py-4">Loading...</p> : (
                    <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                        {services.map((s: any) => (
                            <div key={s.id} onClick={() => loadTariffs(s.id)} className={`p-2 rounded cursor-pointer border text-sm ${selectedService === s.id ? 'bg-emerald-50 border-emerald-400' : 'hover:bg-gray-50 border-gray-200'}`}>
                                <div className="flex justify-between">
                                    <span className="font-medium">{s.service_name}</span>
                                    <span className="text-gray-600">{Number(s.default_rate).toLocaleString('en-IN')}</span>
                                </div>
                                <span className="text-xs text-gray-400">{s.service_code} | {s.service_category}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div>
                <h3 className="font-semibold text-sm mb-3">Tariff Rates {selectedService ? `(Service #${selectedService})` : ''}</h3>
                {selectedService ? (
                    <>
                        <div className="flex gap-2 mb-3">
                            <select className="border rounded px-2 py-1 text-sm flex-1" value={tariffForm.tariff_category} onChange={e => setTariffForm({ ...tariffForm, tariff_category: e.target.value })}>
                                {['General', 'CGHS', 'ECHS', 'Insurance', 'Corporate', 'BPL'].map(c => <option key={c}>{c}</option>)}
                            </select>
                            <input className="border rounded px-2 py-1 text-sm w-28" placeholder="Rate" type="number" value={tariffForm.rate} onChange={e => setTariffForm({ ...tariffForm, rate: e.target.value })} />
                            <button onClick={handleAddTariff} className="bg-emerald-600 text-white px-3 py-1 rounded text-xs">Add</button>
                        </div>
                        <table className="w-full text-sm">
                            <thead><tr className="bg-gray-50"><th className="p-2 text-left">Category</th><th className="p-2 text-right">Rate</th></tr></thead>
                            <tbody>
                                {tariffs.map((t: any) => (
                                    <tr key={t.id} className="border-b">
                                        <td className="p-2">{t.tariff_category}</td>
                                        <td className="p-2 text-right font-medium">{Number(t.rate).toLocaleString('en-IN')}</td>
                                    </tr>
                                ))}
                                {tariffs.length === 0 && <tr><td colSpan={2} className="p-4 text-center text-gray-400">No tariff rates defined</td></tr>}
                            </tbody>
                        </table>
                    </>
                ) : <p className="text-gray-400 text-center py-8">Select a service to view tariff rates</p>}
            </div>
        </div>
    );
}

// ============================================
// TAB 3: IPD PACKAGES
// ============================================
function PackagesTab({ showToast }: { showToast: (m: string, t?: 'success' | 'error') => void }) {
    const [packages, setPackages] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ package_code: '', package_name: '', description: '', total_amount: '', validity_days: '7' });

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        setLoading(true);
        const res = await getIpdPackages();
        if (res.success) setPackages(res.data);
        setLoading(false);
    }

    async function handleAdd() {
        if (!form.package_code || !form.package_name || !form.total_amount) return;
        const res = await addIpdPackage({
            package_code: form.package_code,
            package_name: form.package_name,
            description: form.description || undefined,
            total_amount: parseFloat(form.total_amount),
            validity_days: parseInt(form.validity_days) || 7,
            inclusions: [],
        });
        if (res.success) {
            showToast('Package added');
            setShowForm(false);
            setForm({ package_code: '', package_name: '', description: '', total_amount: '', validity_days: '7' });
            loadData();
        } else showToast(res.error || 'Failed', 'error');
    }

    async function toggleActive(id: number, current: boolean) {
        await updateIpdPackage(id, { is_active: !current });
        loadData();
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <span className="text-sm text-gray-500">{packages.length} packages</span>
                <button onClick={() => setShowForm(!showForm)} className="bg-emerald-600 text-white px-4 py-1.5 rounded text-sm hover:bg-emerald-700">+ Add Package</button>
            </div>
            {showForm && (
                <div className="border rounded-lg p-4 mb-4 bg-gray-50 grid grid-cols-5 gap-3">
                    <input className="border rounded px-2 py-1.5 text-sm" placeholder="Code" value={form.package_code} onChange={e => setForm({ ...form, package_code: e.target.value })} />
                    <input className="border rounded px-2 py-1.5 text-sm" placeholder="Name" value={form.package_name} onChange={e => setForm({ ...form, package_name: e.target.value })} />
                    <input className="border rounded px-2 py-1.5 text-sm" placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                    <input className="border rounded px-2 py-1.5 text-sm" placeholder="Amount" type="number" value={form.total_amount} onChange={e => setForm({ ...form, total_amount: e.target.value })} />
                    <button onClick={handleAdd} className="bg-emerald-600 text-white rounded text-sm">Save</button>
                </div>
            )}
            <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 text-left">
                    <th className="p-2">Code</th><th className="p-2">Name</th><th className="p-2">Description</th>
                    <th className="p-2 text-right">Amount</th><th className="p-2">Validity</th><th className="p-2">Active</th>
                </tr></thead>
                <tbody>
                    {packages.map((pkg: any) => (
                        <tr key={pkg.id} className="border-b hover:bg-gray-50">
                            <td className="p-2 font-mono text-xs">{pkg.package_code}</td>
                            <td className="p-2 font-medium">{pkg.package_name}</td>
                            <td className="p-2 text-gray-500 text-xs">{pkg.description || '-'}</td>
                            <td className="p-2 text-right font-medium">{Number(pkg.total_amount).toLocaleString('en-IN')}</td>
                            <td className="p-2">{pkg.validity_days}d</td>
                            <td className="p-2">
                                <button onClick={() => toggleActive(pkg.id, pkg.is_active)} className={`px-2 py-0.5 rounded text-xs ${pkg.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {pkg.is_active ? 'Active' : 'Inactive'}
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ============================================
// TAB 4: LAB PRICING
// ============================================
function LabPricingTab({ showToast }: { showToast: (m: string, t?: 'success' | 'error') => void }) {
    const [tests, setTests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [editId, setEditId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState({ price: '', hsn_sac_code: '', tax_rate: '' });

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        setLoading(true);
        const res = await getLabTestPricing();
        if (res.success) setTests(res.data);
        setLoading(false);
    }

    function startEdit(test: any) {
        setEditId(test.id);
        setEditForm({ price: String(test.price), hsn_sac_code: test.hsn_sac_code || '', tax_rate: String(test.tax_rate || 0) });
    }

    async function saveEdit() {
        if (editId === null) return;
        const res = await updateLabTestPrice(editId, {
            price: parseFloat(editForm.price),
            hsn_sac_code: editForm.hsn_sac_code || undefined,
            tax_rate: parseFloat(editForm.tax_rate) || 0,
        });
        if (res.success) {
            showToast('Lab test pricing updated');
            setEditId(null);
            loadData();
        } else showToast(res.error || 'Failed', 'error');
    }

    return (
        <div>
            <div className="mb-3 text-sm text-gray-500">{tests.length} lab tests</div>
            {loading ? <p className="text-gray-400 text-center py-8">Loading...</p> : (
                <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50 text-left">
                        <th className="p-2">Test Name</th><th className="p-2">Category</th><th className="p-2">Sample</th>
                        <th className="p-2 text-right">Price</th><th className="p-2">HSN/SAC</th><th className="p-2 text-right">GST%</th><th className="p-2">Actions</th>
                    </tr></thead>
                    <tbody>
                        {tests.map((test: any) => (
                            <tr key={test.id} className="border-b hover:bg-gray-50">
                                <td className="p-2 font-medium">{test.test_name}</td>
                                <td className="p-2 text-gray-500">{test.category || '-'}</td>
                                <td className="p-2 text-gray-500">{test.sample_type || '-'}</td>
                                {editId === test.id ? (
                                    <>
                                        <td className="p-2"><input className="border rounded px-2 py-1 text-sm w-20 text-right" type="number" value={editForm.price} onChange={e => setEditForm({ ...editForm, price: e.target.value })} /></td>
                                        <td className="p-2"><input className="border rounded px-2 py-1 text-sm w-24" value={editForm.hsn_sac_code} onChange={e => setEditForm({ ...editForm, hsn_sac_code: e.target.value })} /></td>
                                        <td className="p-2"><input className="border rounded px-2 py-1 text-sm w-16 text-right" type="number" value={editForm.tax_rate} onChange={e => setEditForm({ ...editForm, tax_rate: e.target.value })} /></td>
                                        <td className="p-2 flex gap-1">
                                            <button onClick={saveEdit} className="text-emerald-600 text-xs font-medium">Save</button>
                                            <button onClick={() => setEditId(null)} className="text-gray-400 text-xs">Cancel</button>
                                        </td>
                                    </>
                                ) : (
                                    <>
                                        <td className="p-2 text-right font-medium">{Number(test.price).toLocaleString('en-IN')}</td>
                                        <td className="p-2 text-gray-500">{test.hsn_sac_code || '-'}</td>
                                        <td className="p-2 text-right">{test.tax_rate ? `${test.tax_rate}%` : '-'}</td>
                                        <td className="p-2">
                                            <button onClick={() => startEdit(test)} className="text-blue-600 text-xs font-medium">Edit</button>
                                        </td>
                                    </>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

// ============================================
// TAB 5: PHARMACY PRICING
// ============================================
function PharmacyPricingTab({ showToast }: { showToast: (m: string, t?: 'success' | 'error') => void }) {
    const [medicines, setMedicines] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [editId, setEditId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState({ price_per_unit: '', hsn_sac_code: '', tax_rate: '' });

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        setLoading(true);
        const res = await getPharmacyPricing();
        if (res.success) setMedicines(res.data);
        setLoading(false);
    }

    function startEdit(med: any) {
        setEditId(med.id);
        setEditForm({ price_per_unit: String(med.price_per_unit), hsn_sac_code: med.hsn_sac_code || '', tax_rate: String(med.tax_rate || 0) });
    }

    async function saveEdit() {
        if (editId === null) return;
        const res = await updateMedicinePrice(editId, {
            price_per_unit: parseFloat(editForm.price_per_unit),
            hsn_sac_code: editForm.hsn_sac_code || undefined,
            tax_rate: parseFloat(editForm.tax_rate) || 0,
        });
        if (res.success) {
            showToast('Medicine pricing updated');
            setEditId(null);
            loadData();
        } else showToast(res.error || 'Failed', 'error');
    }

    return (
        <div>
            <div className="mb-3 text-sm text-gray-500">{medicines.length} medicines</div>
            {loading ? <p className="text-gray-400 text-center py-8">Loading...</p> : (
                <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50 text-left">
                        <th className="p-2">Brand Name</th><th className="p-2">Generic</th><th className="p-2">Category</th>
                        <th className="p-2 text-right">Unit Price</th><th className="p-2">HSN/SAC</th><th className="p-2 text-right">GST%</th>
                        <th className="p-2 text-right">Min Stock</th><th className="p-2">Actions</th>
                    </tr></thead>
                    <tbody>
                        {medicines.map((med: any) => (
                            <tr key={med.id} className="border-b hover:bg-gray-50">
                                <td className="p-2 font-medium">{med.brand_name}</td>
                                <td className="p-2 text-gray-500 text-xs">{med.generic_name || '-'}</td>
                                <td className="p-2 text-gray-500">{med.category || '-'}</td>
                                {editId === med.id ? (
                                    <>
                                        <td className="p-2"><input className="border rounded px-2 py-1 text-sm w-20 text-right" type="number" value={editForm.price_per_unit} onChange={e => setEditForm({ ...editForm, price_per_unit: e.target.value })} /></td>
                                        <td className="p-2"><input className="border rounded px-2 py-1 text-sm w-24" value={editForm.hsn_sac_code} onChange={e => setEditForm({ ...editForm, hsn_sac_code: e.target.value })} /></td>
                                        <td className="p-2"><input className="border rounded px-2 py-1 text-sm w-16 text-right" type="number" value={editForm.tax_rate} onChange={e => setEditForm({ ...editForm, tax_rate: e.target.value })} /></td>
                                        <td className="p-2">{med.min_threshold}</td>
                                        <td className="p-2 flex gap-1">
                                            <button onClick={saveEdit} className="text-emerald-600 text-xs font-medium">Save</button>
                                            <button onClick={() => setEditId(null)} className="text-gray-400 text-xs">Cancel</button>
                                        </td>
                                    </>
                                ) : (
                                    <>
                                        <td className="p-2 text-right font-medium">{Number(med.price_per_unit).toLocaleString('en-IN')}</td>
                                        <td className="p-2 text-gray-500">{med.hsn_sac_code || '-'}</td>
                                        <td className="p-2 text-right">{med.tax_rate ? `${med.tax_rate}%` : '-'}</td>
                                        <td className="p-2 text-right">{med.min_threshold}</td>
                                        <td className="p-2">
                                            <button onClick={() => startEdit(med)} className="text-blue-600 text-xs font-medium">Edit</button>
                                        </td>
                                    </>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

// ============================================
// TAB 6: DOCTOR FEES
// ============================================
function DoctorFeesTab({ showToast }: { showToast: (m: string, t?: 'success' | 'error') => void }) {
    const [doctors, setDoctors] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [editId, setEditId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ consultation_fee: '', follow_up_fee: '' });

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        setLoading(true);
        const res = await getDoctorFees();
        if (res.success) setDoctors(res.data);
        setLoading(false);
    }

    function startEdit(doc: any) {
        setEditId(doc.id);
        setEditForm({ consultation_fee: String(doc.consultation_fee), follow_up_fee: String(doc.follow_up_fee) });
    }

    async function saveEdit() {
        if (!editId) return;
        const res = await updateDoctorFee(editId, {
            consultation_fee: parseFloat(editForm.consultation_fee),
            follow_up_fee: parseFloat(editForm.follow_up_fee),
        });
        if (res.success) {
            showToast('Doctor fees updated');
            setEditId(null);
            loadData();
        } else showToast(res.error || 'Failed', 'error');
    }

    return (
        <div>
            {loading ? <p className="text-gray-400 text-center py-8">Loading...</p> : (
                <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50 text-left">
                        <th className="p-2">Doctor Name</th><th className="p-2">Specialty</th>
                        <th className="p-2 text-right">First Visit Fee</th><th className="p-2 text-right">Follow-up Fee</th><th className="p-2">Actions</th>
                    </tr></thead>
                    <tbody>
                        {doctors.map((doc: any) => (
                            <tr key={doc.id} className="border-b hover:bg-gray-50">
                                <td className="p-2 font-medium">{doc.name || doc.username}</td>
                                <td className="p-2 text-gray-500">{doc.specialty || '-'}</td>
                                {editId === doc.id ? (
                                    <>
                                        <td className="p-2"><input className="border rounded px-2 py-1 text-sm w-24 text-right" type="number" value={editForm.consultation_fee} onChange={e => setEditForm({ ...editForm, consultation_fee: e.target.value })} /></td>
                                        <td className="p-2"><input className="border rounded px-2 py-1 text-sm w-24 text-right" type="number" value={editForm.follow_up_fee} onChange={e => setEditForm({ ...editForm, follow_up_fee: e.target.value })} /></td>
                                        <td className="p-2 flex gap-1">
                                            <button onClick={saveEdit} className="text-emerald-600 text-xs font-medium">Save</button>
                                            <button onClick={() => setEditId(null)} className="text-gray-400 text-xs">Cancel</button>
                                        </td>
                                    </>
                                ) : (
                                    <>
                                        <td className="p-2 text-right font-medium">{Number(doc.consultation_fee).toLocaleString('en-IN')}</td>
                                        <td className="p-2 text-right font-medium">{Number(doc.follow_up_fee).toLocaleString('en-IN')}</td>
                                        <td className="p-2">
                                            <button onClick={() => startEdit(doc)} className="text-blue-600 text-xs font-medium">Edit</button>
                                        </td>
                                    </>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

// ============================================
// TAB 7: WARD CHARGES
// ============================================
function WardChargesTab({ showToast }: { showToast: (m: string, t?: 'success' | 'error') => void }) {
    const [wards, setWards] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [editId, setEditId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState({ cost_per_day: '', nursing_charge: '' });

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        setLoading(true);
        const res = await getWardPricing();
        if (res.success) setWards(res.data);
        setLoading(false);
    }

    function startEdit(ward: any) {
        setEditId(ward.ward_id);
        setEditForm({ cost_per_day: String(ward.cost_per_day || 0), nursing_charge: String(ward.nursing_charge || 0) });
    }

    async function saveEdit() {
        if (editId === null) return;
        const res = await updateWardPricing(editId, {
            cost_per_day: parseFloat(editForm.cost_per_day),
            nursing_charge: parseFloat(editForm.nursing_charge),
        });
        if (res.success) {
            showToast('Ward pricing updated');
            setEditId(null);
            loadData();
        } else showToast(res.error || 'Failed', 'error');
    }

    return (
        <div>
            {loading ? <p className="text-gray-400 text-center py-8">Loading...</p> : (
                <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50 text-left">
                        <th className="p-2">Ward Name</th><th className="p-2">Type</th><th className="p-2">Floor</th>
                        <th className="p-2 text-right">Room Rate/Day</th><th className="p-2 text-right">Nursing/Day</th>
                        <th className="p-2">Active</th><th className="p-2">Actions</th>
                    </tr></thead>
                    <tbody>
                        {wards.map((ward: any) => (
                            <tr key={ward.ward_id} className="border-b hover:bg-gray-50">
                                <td className="p-2 font-medium">{ward.ward_name}</td>
                                <td className="p-2 text-gray-500">{ward.ward_type}</td>
                                <td className="p-2 text-gray-500">{ward.floor_number || '-'}</td>
                                {editId === ward.ward_id ? (
                                    <>
                                        <td className="p-2"><input className="border rounded px-2 py-1 text-sm w-24 text-right" type="number" value={editForm.cost_per_day} onChange={e => setEditForm({ ...editForm, cost_per_day: e.target.value })} /></td>
                                        <td className="p-2"><input className="border rounded px-2 py-1 text-sm w-24 text-right" type="number" value={editForm.nursing_charge} onChange={e => setEditForm({ ...editForm, nursing_charge: e.target.value })} /></td>
                                        <td className="p-2">{ward.is_active ? 'Yes' : 'No'}</td>
                                        <td className="p-2 flex gap-1">
                                            <button onClick={saveEdit} className="text-emerald-600 text-xs font-medium">Save</button>
                                            <button onClick={() => setEditId(null)} className="text-gray-400 text-xs">Cancel</button>
                                        </td>
                                    </>
                                ) : (
                                    <>
                                        <td className="p-2 text-right font-medium">{Number(ward.cost_per_day || 0).toLocaleString('en-IN')}</td>
                                        <td className="p-2 text-right font-medium">{Number(ward.nursing_charge || 0).toLocaleString('en-IN')}</td>
                                        <td className="p-2"><span className={`px-2 py-0.5 rounded text-xs ${ward.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{ward.is_active ? 'Yes' : 'No'}</span></td>
                                        <td className="p-2">
                                            <button onClick={() => startEdit(ward)} className="text-blue-600 text-xs font-medium">Edit</button>
                                        </td>
                                    </>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

// ============================================
// TAB 8: TAX/GST CONFIGURATION
// ============================================
function TaxConfigTab({ showToast }: { showToast: (m: string, t?: 'success' | 'error') => void }) {
    const [configs, setConfigs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ tax_name: '', tax_code: '', rate: '', is_default: false, applicable_to: '' });

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        setLoading(true);
        const res = await getTaxConfigs();
        if (res.success) setConfigs(res.data);
        setLoading(false);
    }

    async function handleAdd() {
        if (!form.tax_name || !form.tax_code || !form.rate) return;
        const res = await addTaxConfig({
            tax_name: form.tax_name,
            tax_code: form.tax_code,
            rate: parseFloat(form.rate),
            is_default: form.is_default,
            applicable_to: form.applicable_to || undefined,
        });
        if (res.success) {
            showToast('Tax config added');
            setShowForm(false);
            setForm({ tax_name: '', tax_code: '', rate: '', is_default: false, applicable_to: '' });
            loadData();
        } else showToast(res.error || 'Failed', 'error');
    }

    async function toggleActive(id: number, current: boolean) {
        await updateTaxConfig(id, { is_active: !current });
        loadData();
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <span className="text-sm text-gray-500">{configs.length} tax configurations</span>
                <button onClick={() => setShowForm(!showForm)} className="bg-emerald-600 text-white px-4 py-1.5 rounded text-sm hover:bg-emerald-700">+ Add Tax</button>
            </div>
            {showForm && (
                <div className="border rounded-lg p-4 mb-4 bg-gray-50 grid grid-cols-6 gap-3 items-end">
                    <input className="border rounded px-2 py-1.5 text-sm" placeholder="Tax Name (e.g. GST 18%)" value={form.tax_name} onChange={e => setForm({ ...form, tax_name: e.target.value })} />
                    <input className="border rounded px-2 py-1.5 text-sm" placeholder="Code (e.g. GST18)" value={form.tax_code} onChange={e => setForm({ ...form, tax_code: e.target.value })} />
                    <input className="border rounded px-2 py-1.5 text-sm" placeholder="Rate %" type="number" value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} />
                    <input className="border rounded px-2 py-1.5 text-sm" placeholder="Applicable To" value={form.applicable_to} onChange={e => setForm({ ...form, applicable_to: e.target.value })} />
                    <label className="flex items-center gap-1 text-sm">
                        <input type="checkbox" checked={form.is_default} onChange={e => setForm({ ...form, is_default: e.target.checked })} /> Default
                    </label>
                    <button onClick={handleAdd} className="bg-emerald-600 text-white rounded text-sm py-1.5">Save</button>
                </div>
            )}
            <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 text-left">
                    <th className="p-2">Tax Name</th><th className="p-2">Code</th><th className="p-2 text-right">Rate %</th>
                    <th className="p-2">Default</th><th className="p-2">Applicable To</th><th className="p-2">Active</th>
                </tr></thead>
                <tbody>
                    {configs.map((cfg: any) => (
                        <tr key={cfg.id} className="border-b hover:bg-gray-50">
                            <td className="p-2 font-medium">{cfg.tax_name}</td>
                            <td className="p-2 font-mono text-xs">{cfg.tax_code}</td>
                            <td className="p-2 text-right">{Number(cfg.rate)}%</td>
                            <td className="p-2">{cfg.is_default ? <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">Default</span> : '-'}</td>
                            <td className="p-2 text-gray-500">{cfg.applicable_to || 'All'}</td>
                            <td className="p-2">
                                <button onClick={() => toggleActive(cfg.id, cfg.is_active)} className={`px-2 py-0.5 rounded text-xs ${cfg.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {cfg.is_active ? 'Active' : 'Inactive'}
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
