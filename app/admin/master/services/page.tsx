'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Loader2, Pencil, PowerOff, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  listServices, createService, updateService, deactivateService,
  listLabTests, createLabTest, updateLabTest,
  listPackages, createPackage, updatePackage,
} from '@/app/actions/service-master-actions';
import { ensureIPDDemoMasterData } from '@/app/actions/ipd-billing-helpers';
import MasterImportButton from '@/app/components/master/MasterImportButton';

const PAGE_LIMIT = 25;
const SERVICE_CATEGORIES = ['OPD Consultation', 'ICU', 'Procedure', 'Room', 'Nursing', 'Diet', 'Consumable', 'Misc'] as const;

type SubTab = 'services' | 'labtests' | 'packages';

const EMPTY_SERVICE = {
  service_code: '', service_name: '',
  service_category: 'OPD Consultation' as typeof SERVICE_CATEGORIES[number],
  default_rate: 0, hsn_sac_code: '', tax_rate: 0, is_active: true,
};

const EMPTY_LAB_TEST = {
  test_name: '', price: 0, category: '', sample_type: '', unit: '',
  normal_range_min: '', normal_range_max: '', hsn_sac_code: '', tax_rate: 0, is_available: true,
};

const EMPTY_PACKAGE = {
  package_code: '', package_name: '', description: '',
  total_amount: 0, validity_days: 7, exclusions: '', is_active: true,
  inclusions: [{ name: '', qty: 1 }],
};

export default function ServiceMasterPage() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('services');

  // ---- Services state ----
  const [svcRows, setSvcRows] = useState<any[]>([]);
  const [svcLoading, setSvcLoading] = useState(true);
  const [svcSearchInput, setSvcSearchInput] = useState('');
  const [svcSearch, setSvcSearch] = useState('');
  const [svcPage, setSvcPage] = useState(1);
  const [svcTotal, setSvcTotal] = useState(0);
  const [svcTotalPages, setSvcTotalPages] = useState(0);
  const [svcMode, setSvcMode] = useState<'idle' | 'create' | 'edit'>('idle');
  const [svcEditingId, setSvcEditingId] = useState<number | null>(null);
  const [svcForm, setSvcForm] = useState<any>(EMPTY_SERVICE);
  const [svcSubmitting, setSvcSubmitting] = useState(false);

  // ---- Lab Tests state ----
  const [labRows, setLabRows] = useState<any[]>([]);
  const [labLoading, setLabLoading] = useState(true);
  const [labSearchInput, setLabSearchInput] = useState('');
  const [labSearch, setLabSearch] = useState('');
  const [labPage, setLabPage] = useState(1);
  const [labTotal, setLabTotal] = useState(0);
  const [labTotalPages, setLabTotalPages] = useState(0);
  const [labMode, setLabMode] = useState<'idle' | 'create' | 'edit'>('idle');
  const [labEditingId, setLabEditingId] = useState<number | null>(null);
  const [labForm, setLabForm] = useState<any>(EMPTY_LAB_TEST);
  const [labSubmitting, setLabSubmitting] = useState(false);

  // ---- Packages state ----
  const [pkgRows, setPkgRows] = useState<any[]>([]);
  const [pkgLoading, setPkgLoading] = useState(true);
  const [pkgSearchInput, setPkgSearchInput] = useState('');
  const [pkgSearch, setPkgSearch] = useState('');
  const [pkgPage, setPkgPage] = useState(1);
  const [pkgTotal, setPkgTotal] = useState(0);
  const [pkgTotalPages, setPkgTotalPages] = useState(0);
  const [pkgMode, setPkgMode] = useState<'idle' | 'create' | 'edit'>('idle');
  const [pkgEditingId, setPkgEditingId] = useState<number | null>(null);
  const [pkgForm, setPkgForm] = useState<any>(EMPTY_PACKAGE);
  const [pkgSubmitting, setPkgSubmitting] = useState(false);

  const [seeding, setSeeding] = useState(false);
  const handleSeedDemo = async () => {
    setSeeding(true);
    const res = await ensureIPDDemoMasterData();
    if (res.success) {
      const d = res.data;
      const parts: string[] = [];
      if (d.wards) parts.push(`${d.wards} wards`);
      if (d.beds) parts.push(`${d.beds} beds`);
      if (d.services) parts.push(`${d.services} services`);
      if (parts.length > 0) {
        toast.success(`Seeded: ${parts.join(', ')}`);
        loadServices();
      } else {
        toast.success('Demo data already exists — nothing added');
      }
    } else {
      toast.error(res.error || 'Seed failed');
    }
    setSeeding(false);
  };

  // ---- Load functions ----
  const loadServices = useCallback(async () => {
    setSvcLoading(true);
    const res = await listServices({ search: svcSearch, page: svcPage, limit: PAGE_LIMIT });
    if (res.success) {
      setSvcRows(res.data.rows);
      setSvcTotal(res.data.total);
      setSvcTotalPages(res.data.totalPages);
    } else {
      toast.error(res.error || 'Failed to load services');
    }
    setSvcLoading(false);
  }, [svcSearch, svcPage]);

  const loadLabTests = useCallback(async () => {
    setLabLoading(true);
    const res = await listLabTests({ search: labSearch, page: labPage, limit: PAGE_LIMIT });
    if (res.success) {
      setLabRows(res.data.rows);
      setLabTotal(res.data.total);
      setLabTotalPages(res.data.totalPages);
    } else {
      toast.error(res.error || 'Failed to load lab tests');
    }
    setLabLoading(false);
  }, [labSearch, labPage]);

  const loadPackages = useCallback(async () => {
    setPkgLoading(true);
    const res = await listPackages({ search: pkgSearch, page: pkgPage, limit: PAGE_LIMIT });
    if (res.success) {
      setPkgRows(res.data.rows);
      setPkgTotal(res.data.total);
      setPkgTotalPages(res.data.totalPages);
    } else {
      toast.error(res.error || 'Failed to load packages');
    }
    setPkgLoading(false);
  }, [pkgSearch, pkgPage]);

  useEffect(() => { loadServices(); }, [loadServices]);
  useEffect(() => { loadLabTests(); }, [loadLabTests]);
  useEffect(() => { loadPackages(); }, [loadPackages]);

  useEffect(() => {
    const t = setTimeout(() => { setSvcSearch(svcSearchInput); setSvcPage(1); }, 350);
    return () => clearTimeout(t);
  }, [svcSearchInput]);

  useEffect(() => {
    const t = setTimeout(() => { setLabSearch(labSearchInput); setLabPage(1); }, 350);
    return () => clearTimeout(t);
  }, [labSearchInput]);

  useEffect(() => {
    const t = setTimeout(() => { setPkgSearch(pkgSearchInput); setPkgPage(1); }, 350);
    return () => clearTimeout(t);
  }, [pkgSearchInput]);

  // ---- Services handlers ----
  const openCreateSvc = () => { setSvcForm(EMPTY_SERVICE); setSvcMode('create'); };
  const openEditSvc = (row: any) => {
    setSvcEditingId(row.id);
    setSvcForm({ ...EMPTY_SERVICE, ...row, default_rate: Number(row.default_rate ?? 0), tax_rate: Number(row.tax_rate ?? 0) });
    setSvcMode('edit');
  };
  const closeSvc = () => { setSvcMode('idle'); setSvcEditingId(null); };

  const submitSvc = async (e: React.FormEvent) => {
    e.preventDefault();
    setSvcSubmitting(true);
    const payload = {
      ...svcForm,
      default_rate: Number(svcForm.default_rate),
      tax_rate: Number(svcForm.tax_rate),
    };
    const res = svcMode === 'create'
      ? await createService(payload)
      : await updateService(svcEditingId!, payload);
    if (res.success) {
      toast.success(svcMode === 'create' ? 'Service created' : 'Service updated');
      closeSvc();
      loadServices();
    } else {
      toast.error(res.error || 'Failed');
    }
    setSvcSubmitting(false);
  };

  const deactivateSvc = async (id: number) => {
    if (!confirm('Deactivate this service?')) return;
    const res = await deactivateService(id);
    if (res.success) { toast.success('Service deactivated'); loadServices(); }
    else toast.error(res.error || 'Failed');
  };

  // ---- Lab Test handlers ----
  const openCreateLab = () => { setLabForm(EMPTY_LAB_TEST); setLabMode('create'); };
  const openEditLab = (row: any) => {
    setLabEditingId(row.id);
    setLabForm({
      ...EMPTY_LAB_TEST, ...row,
      price: Number(row.price ?? 0),
      tax_rate: Number(row.tax_rate ?? 0),
      normal_range_min: row.normal_range_min ?? '',
      normal_range_max: row.normal_range_max ?? '',
    });
    setLabMode('edit');
  };
  const closeLab = () => { setLabMode('idle'); setLabEditingId(null); };

  const submitLab = async (e: React.FormEvent) => {
    e.preventDefault();
    setLabSubmitting(true);
    const payload: any = {
      ...labForm,
      price: Number(labForm.price),
      tax_rate: Number(labForm.tax_rate),
    };
    if (labForm.normal_range_min !== '') payload.normal_range_min = Number(labForm.normal_range_min);
    else delete payload.normal_range_min;
    if (labForm.normal_range_max !== '') payload.normal_range_max = Number(labForm.normal_range_max);
    else delete payload.normal_range_max;

    const res = labMode === 'create'
      ? await createLabTest(payload)
      : await updateLabTest(labEditingId!, payload);
    if (res.success) {
      toast.success(labMode === 'create' ? 'Lab test created' : 'Lab test updated');
      closeLab();
      loadLabTests();
    } else {
      toast.error(res.error || 'Failed');
    }
    setLabSubmitting(false);
  };

  // ---- Package handlers ----
  const openCreatePkg = () => { setPkgForm(EMPTY_PACKAGE); setPkgMode('create'); };
  const openEditPkg = (row: any) => {
    setPkgEditingId(row.id);
    setPkgForm({
      ...EMPTY_PACKAGE, ...row,
      total_amount: Number(row.total_amount ?? 0),
      validity_days: Number(row.validity_days ?? 7),
      inclusions: Array.isArray(row.inclusions) && row.inclusions.length > 0
        ? row.inclusions
        : [{ name: '', qty: 1 }],
    });
    setPkgMode('edit');
  };
  const closePkg = () => { setPkgMode('idle'); setPkgEditingId(null); };

  const submitPkg = async (e: React.FormEvent) => {
    e.preventDefault();
    setPkgSubmitting(true);
    const payload = {
      ...pkgForm,
      total_amount: Number(pkgForm.total_amount),
      validity_days: Number(pkgForm.validity_days),
      inclusions: pkgForm.inclusions.filter((inc: any) => inc.name.trim() !== '').map((inc: any) => ({ name: inc.name, qty: Number(inc.qty) })),
    };
    const res = pkgMode === 'create'
      ? await createPackage(payload)
      : await updatePackage(pkgEditingId!, payload);
    if (res.success) {
      toast.success(pkgMode === 'create' ? 'Package created' : 'Package updated');
      closePkg();
      loadPackages();
    } else {
      toast.error(res.error || 'Failed');
    }
    setPkgSubmitting(false);
  };

  const TABS: { key: SubTab; label: string }[] = [
    { key: 'services', label: 'Services' },
    { key: 'labtests', label: 'Lab Tests' },
    { key: 'packages', label: 'Packages' },
  ];

  return (
    <div className="space-y-6">
      {/* Sub-tab navigation */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveSubTab(t.key)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${activeSubTab === t.key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ===== SERVICES TAB ===== */}
      {activeSubTab === 'services' && (
        <>
          <div className="flex items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text" value={svcSearchInput}
                onChange={e => setSvcSearchInput(e.target.value)}
                placeholder="Search by name or code"
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleSeedDemo} disabled={seeding}
                className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-white text-sm font-semibold rounded-xl hover:bg-amber-600 disabled:opacity-50">
                {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Seed Demo Data
              </button>
              <MasterImportButton type="service_master" onImportComplete={loadServices} />
              <button onClick={openCreateSvc}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">
                <Plus className="h-4 w-4" /> Add Service
              </button>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80">
                  {['Code', 'Name', 'Category', 'Rate', 'Tax%', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {svcLoading ? (
                  <tr><td colSpan={7} className="text-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-500 mx-auto" /></td></tr>
                ) : svcRows.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-400">No services found</td></tr>
                ) : svcRows.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.service_code}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{r.service_name}</td>
                    <td className="px-4 py-3 text-gray-600">{r.service_category}</td>
                    <td className="px-4 py-3 text-gray-600">₹{Number(r.default_rate).toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-600">{Number(r.tax_rate).toFixed(1)}%</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 rounded-full text-[10px] font-bold ${r.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {r.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 flex gap-2">
                      <button onClick={() => openEditSvc(r)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Pencil className="h-4 w-4 text-blue-600" /></button>
                      {r.is_active && (
                        <button onClick={() => deactivateSvc(r.id)} className="p-1.5 hover:bg-gray-100 rounded-lg"><PowerOff className="h-4 w-4 text-red-600" /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {svcTotalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                <span className="text-xs text-gray-500">Showing {(svcPage - 1) * PAGE_LIMIT + 1}–{Math.min(svcPage * PAGE_LIMIT, svcTotal)} of {svcTotal}</span>
                <div className="flex gap-2 items-center">
                  <button onClick={() => setSvcPage(p => Math.max(1, p - 1))} disabled={svcPage <= 1} className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
                  <span className="text-xs font-medium">Page {svcPage} of {svcTotalPages}</span>
                  <button onClick={() => setSvcPage(p => Math.min(svcTotalPages, p + 1))} disabled={svcPage >= svcTotalPages} className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
                </div>
              </div>
            )}
          </div>

          {svcMode !== 'idle' && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-lg max-h-[90vh] overflow-y-auto">
                <h2 className="text-lg font-bold mb-4">{svcMode === 'create' ? 'Add Service' : 'Edit Service'}</h2>
                <form onSubmit={submitSvc} className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Service Code *</label>
                    <input type="text" required value={svcForm.service_code}
                      onChange={e => setSvcForm((p: any) => ({ ...p, service_code: e.target.value }))}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Service Name *</label>
                    <input type="text" required value={svcForm.service_name}
                      onChange={e => setSvcForm((p: any) => ({ ...p, service_name: e.target.value }))}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Category *</label>
                    <select required value={svcForm.service_category}
                      onChange={e => setSvcForm((p: any) => ({ ...p, service_category: e.target.value }))}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                      {SERVICE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Default Rate (₹) *</label>
                    <input type="number" required min={0} step="0.01" value={svcForm.default_rate}
                      onChange={e => setSvcForm((p: any) => ({ ...p, default_rate: e.target.value }))}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">HSN/SAC Code</label>
                    <input type="text" value={svcForm.hsn_sac_code}
                      onChange={e => setSvcForm((p: any) => ({ ...p, hsn_sac_code: e.target.value }))}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Tax Rate (%)</label>
                    <input type="number" min={0} step="0.01" value={svcForm.tax_rate}
                      onChange={e => setSvcForm((p: any) => ({ ...p, tax_rate: e.target.value }))}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <label className="col-span-2 flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!svcForm.is_active}
                      onChange={e => setSvcForm((p: any) => ({ ...p, is_active: e.target.checked }))} />
                    Active
                  </label>
                  <div className="col-span-2 flex gap-3 mt-2">
                    <button type="button" onClick={closeSvc}
                      className="flex-1 py-2 px-4 border border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-50">Cancel</button>
                    <button type="submit" disabled={svcSubmitting}
                      className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
                      {svcSubmitting ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}

      {/* ===== LAB TESTS TAB ===== */}
      {activeSubTab === 'labtests' && (
        <>
          <div className="flex items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text" value={labSearchInput}
                onChange={e => setLabSearchInput(e.target.value)}
                placeholder="Search by test name"
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <MasterImportButton type="lab_test_master" onImportComplete={loadLabTests} />
              <button onClick={openCreateLab}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">
                <Plus className="h-4 w-4" /> Add Lab Test
              </button>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80">
                  {['Name', 'Category', 'Price', 'Tax%', 'Available', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {labLoading ? (
                  <tr><td colSpan={6} className="text-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-500 mx-auto" /></td></tr>
                ) : labRows.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-gray-400">No lab tests found</td></tr>
                ) : labRows.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold text-gray-900">{r.test_name}</td>
                    <td className="px-4 py-3 text-gray-600">{r.category || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">₹{Number(r.price).toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-600">{Number(r.tax_rate).toFixed(1)}%</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 rounded-full text-[10px] font-bold ${r.is_available ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {r.is_available ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => openEditLab(r)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Pencil className="h-4 w-4 text-blue-600" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {labTotalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                <span className="text-xs text-gray-500">Showing {(labPage - 1) * PAGE_LIMIT + 1}–{Math.min(labPage * PAGE_LIMIT, labTotal)} of {labTotal}</span>
                <div className="flex gap-2 items-center">
                  <button onClick={() => setLabPage(p => Math.max(1, p - 1))} disabled={labPage <= 1} className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
                  <span className="text-xs font-medium">Page {labPage} of {labTotalPages}</span>
                  <button onClick={() => setLabPage(p => Math.min(labTotalPages, p + 1))} disabled={labPage >= labTotalPages} className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
                </div>
              </div>
            )}
          </div>

          {labMode !== 'idle' && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-lg max-h-[90vh] overflow-y-auto">
                <h2 className="text-lg font-bold mb-4">{labMode === 'create' ? 'Add Lab Test' : 'Edit Lab Test'}</h2>
                <form onSubmit={submitLab} className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-600 mb-1">Test Name *</label>
                    <input type="text" required value={labForm.test_name}
                      onChange={e => setLabForm((p: any) => ({ ...p, test_name: e.target.value }))}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Price (₹) *</label>
                    <input type="number" required min={0} step="0.01" value={labForm.price}
                      onChange={e => setLabForm((p: any) => ({ ...p, price: e.target.value }))}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Category</label>
                    <input type="text" value={labForm.category}
                      onChange={e => setLabForm((p: any) => ({ ...p, category: e.target.value }))}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Sample Type</label>
                    <input type="text" value={labForm.sample_type}
                      onChange={e => setLabForm((p: any) => ({ ...p, sample_type: e.target.value }))}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Unit</label>
                    <input type="text" value={labForm.unit}
                      onChange={e => setLabForm((p: any) => ({ ...p, unit: e.target.value }))}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Normal Range Min</label>
                    <input type="number" step="any" value={labForm.normal_range_min}
                      onChange={e => setLabForm((p: any) => ({ ...p, normal_range_min: e.target.value }))}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Normal Range Max</label>
                    <input type="number" step="any" value={labForm.normal_range_max}
                      onChange={e => setLabForm((p: any) => ({ ...p, normal_range_max: e.target.value }))}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">HSN/SAC Code</label>
                    <input type="text" value={labForm.hsn_sac_code}
                      onChange={e => setLabForm((p: any) => ({ ...p, hsn_sac_code: e.target.value }))}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Tax Rate (%)</label>
                    <input type="number" min={0} step="0.01" value={labForm.tax_rate}
                      onChange={e => setLabForm((p: any) => ({ ...p, tax_rate: e.target.value }))}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <label className="col-span-2 flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!labForm.is_available}
                      onChange={e => setLabForm((p: any) => ({ ...p, is_available: e.target.checked }))} />
                    Available
                  </label>
                  <div className="col-span-2 flex gap-3 mt-2">
                    <button type="button" onClick={closeLab}
                      className="flex-1 py-2 px-4 border border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-50">Cancel</button>
                    <button type="submit" disabled={labSubmitting}
                      className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
                      {labSubmitting ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}

      {/* ===== PACKAGES TAB ===== */}
      {activeSubTab === 'packages' && (
        <>
          <div className="flex items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text" value={pkgSearchInput}
                onChange={e => setPkgSearchInput(e.target.value)}
                placeholder="Search by package name"
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <MasterImportButton type="package_master" onImportComplete={loadPackages} />
              <button onClick={openCreatePkg}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">
                <Plus className="h-4 w-4" /> Add Package
              </button>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80">
                  {['Code', 'Name', 'Amount', 'Validity (days)', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pkgLoading ? (
                  <tr><td colSpan={6} className="text-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-500 mx-auto" /></td></tr>
                ) : pkgRows.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-gray-400">No packages found</td></tr>
                ) : pkgRows.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.package_code}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{r.package_name}</td>
                    <td className="px-4 py-3 text-gray-600">₹{Number(r.total_amount).toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-600">{r.validity_days}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 rounded-full text-[10px] font-bold ${r.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {r.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => openEditPkg(r)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Pencil className="h-4 w-4 text-blue-600" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pkgTotalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                <span className="text-xs text-gray-500">Showing {(pkgPage - 1) * PAGE_LIMIT + 1}–{Math.min(pkgPage * PAGE_LIMIT, pkgTotal)} of {pkgTotal}</span>
                <div className="flex gap-2 items-center">
                  <button onClick={() => setPkgPage(p => Math.max(1, p - 1))} disabled={pkgPage <= 1} className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
                  <span className="text-xs font-medium">Page {pkgPage} of {pkgTotalPages}</span>
                  <button onClick={() => setPkgPage(p => Math.min(pkgTotalPages, p + 1))} disabled={pkgPage >= pkgTotalPages} className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
                </div>
              </div>
            )}
          </div>

          {pkgMode !== 'idle' && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-lg max-h-[90vh] overflow-y-auto">
                <h2 className="text-lg font-bold mb-4">{pkgMode === 'create' ? 'Add Package' : 'Edit Package'}</h2>
                <form onSubmit={submitPkg} className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Package Code *</label>
                    <input type="text" required value={pkgForm.package_code}
                      onChange={e => setPkgForm((p: any) => ({ ...p, package_code: e.target.value }))}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Package Name *</label>
                    <input type="text" required value={pkgForm.package_name}
                      onChange={e => setPkgForm((p: any) => ({ ...p, package_name: e.target.value }))}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-600 mb-1">Description</label>
                    <textarea rows={2} value={pkgForm.description}
                      onChange={e => setPkgForm((p: any) => ({ ...p, description: e.target.value }))}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Total Amount (₹) *</label>
                    <input type="number" required min={0} step="0.01" value={pkgForm.total_amount}
                      onChange={e => setPkgForm((p: any) => ({ ...p, total_amount: e.target.value }))}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Validity (days)</label>
                    <input type="number" min={1} value={pkgForm.validity_days}
                      onChange={e => setPkgForm((p: any) => ({ ...p, validity_days: e.target.value }))}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-600 mb-1">Exclusions</label>
                    <input type="text" value={pkgForm.exclusions}
                      onChange={e => setPkgForm((p: any) => ({ ...p, exclusions: e.target.value }))}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-600 mb-2">Inclusions</label>
                    <div className="space-y-2">
                      {pkgForm.inclusions.map((inc: any, i: number) => (
                        <div key={i} className="flex gap-2 items-center">
                          <input type="text" placeholder="Service/item name"
                            value={inc.name}
                            onChange={e => setPkgForm((p: any) => { const incl = [...p.inclusions]; incl[i] = { ...incl[i], name: e.target.value }; return { ...p, inclusions: incl }; })}
                            className="flex-1 p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none"
                          />
                          <input type="number" placeholder="Qty" min={1}
                            value={inc.qty}
                            onChange={e => setPkgForm((p: any) => { const incl = [...p.inclusions]; incl[i] = { ...incl[i], qty: Number(e.target.value) }; return { ...p, inclusions: incl }; })}
                            className="w-20 p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none"
                          />
                          <button type="button" onClick={() => setPkgForm((p: any) => ({ ...p, inclusions: p.inclusions.filter((_: any, j: number) => j !== i) }))}
                            className="p-1.5 hover:bg-red-50 rounded-lg text-red-500"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      ))}
                      <button type="button" onClick={() => setPkgForm((p: any) => ({ ...p, inclusions: [...p.inclusions, { name: '', qty: 1 }] }))}
                        className="text-xs text-blue-600 hover:underline">+ Add row</button>
                    </div>
                  </div>
                  <label className="col-span-2 flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!pkgForm.is_active}
                      onChange={e => setPkgForm((p: any) => ({ ...p, is_active: e.target.checked }))} />
                    Active
                  </label>
                  <div className="col-span-2 flex gap-3 mt-2">
                    <button type="button" onClick={closePkg}
                      className="flex-1 py-2 px-4 border border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-50">Cancel</button>
                    <button type="submit" disabled={pkgSubmitting}
                      className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
                      {pkgSubmitting ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
