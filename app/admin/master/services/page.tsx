'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Plus, Loader2, Pencil, PowerOff, ChevronLeft, ChevronRight, Trash2, Download, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import {
  listServices, createService, updateService, deactivateService, deleteService,
  listLabTests, createLabTest, updateLabTest, deleteLabTest,
  listPackages, createPackage, updatePackage, deletePackage,
  listPackageTpaRates, bulkUpsertPackageTpaRates,
  createExclusivePackage, updateExclusivePackage, deleteExclusivePackage,
  listRadiologyImaging, createRadiologyImaging, updateRadiologyImaging, deleteRadiologyImaging,
  exportRadiologyImaging,
} from '@/app/actions/service-master-actions';
import { getInsuranceProviders } from '@/app/actions/insurance-actions';
import { ensureIPDDemoMasterData } from '@/app/actions/ipd-billing-helpers';
import MasterImportButton from '@/app/components/master/MasterImportButton';
import MasterExportButton from '@/app/components/master/MasterExportButton';

const sanitizeMoney = (value: string) => value.replace(/[^\d.]/g, '');
const sanitizeInteger = (value: string) => value.replace(/\D/g, '');
const sanitizeText = (value: string) => value.replace(/[^a-zA-Z0-9\s./,+()%-]/g, '');

const PAGE_LIMIT = 25;
const SERVICE_CATEGORIES = ['OPD Consultation', 'ICU', 'Procedure', 'Room', 'Nursing', 'Diet', 'Consumable', 'Home Care', 'Visit Charges', 'Observation Ward/Bed Charges', 'Misc'] as const;

type SubTab = 'services' | 'labtests' | 'radiology' | 'packages';

const EMPTY_SERVICE = {
  service_code: '', service_name: '',
  service_category: 'OPD Consultation' as typeof SERVICE_CATEGORIES[number],
  default_rate: 0, hsn_sac_code: '', tax_rate: 0, is_active: true,
  requires_rendered_by: false,
};

const EMPTY_LAB_TEST = {
  test_name: '', price: 0, category: '', sample_type: '', unit: '',
  normal_range_min: '', normal_range_max: '', hsn_sac_code: '', tax_rate: 0, is_available: true,
};

const EMPTY_PACKAGE = {
  package_code: '', package_name: '', description: '',
  total_amount: 0, validity_days: 7, exclusions: '', is_active: true,
  inclusions: [{ name: '', qty: 1, amount: 0 }],
};

const EMPTY_RADIOLOGY = {
  procedure_name: '', procedure_code: '', price: 0, category: '', description: '',
  hsn_sac_code: '', tax_rate: 0, is_available: true, turnaround_time: '',
  requires_prescription: false, modality: '', body_part: '',
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

  // ---- TPA Rates sub-view state (nested inside Packages tab) ----
  const [pkgView, setPkgView] = useState<'list' | 'tpa_rates'>('list');
  const [tpaProviders, setTpaProviders] = useState<{ id: number; provider_name: string; provider_code?: string | null }[]>([]);
  const [tpaRateProviderId, setTpaRateProviderId] = useState<number | ''>('');
  const [tpaRateRows, setTpaRateRows] = useState<{ package_id: number; package_code: string; package_name: string; total_amount: number; tpa_amount: number | null; tpa_package_name: string | null }[]>([]);
  const [tpaRateEdits, setTpaRateEdits] = useState<Record<number, string>>({}); // package_id -> raw rate input value
  const [tpaNameEdits, setTpaNameEdits] = useState<Record<number, string>>({}); // package_id -> raw TPA name input value
  const [tpaRateLoading, setTpaRateLoading] = useState(false);
  const [tpaRateSaving, setTpaRateSaving] = useState(false);
  const [tpaRateExporting, setTpaRateExporting] = useState(false);
  const [tpaRateImporting, setTpaRateImporting] = useState(false);
  const tpaRateFileRef = useRef<HTMLInputElement>(null);

  // ---- Exclusive packages (belong to one TPA only) ----
  const [tpaExclusiveRows, setTpaExclusiveRows] = useState<{ id: number; package_code: string; package_name: string; total_amount: number; validity_days?: number; description?: string | null }[]>([]);
  const [excPkgMode, setExcPkgMode] = useState<'idle' | 'create' | 'edit'>('idle');
  const [excPkgEditingId, setExcPkgEditingId] = useState<number | null>(null);
  const [excPkgForm, setExcPkgForm] = useState({ package_code: '', package_name: '', total_amount: 0, validity_days: 7, description: '' });
  const [excPkgSubmitting, setExcPkgSubmitting] = useState(false);

  // ---- Radiology/Imaging state ----
  const [radRows, setRadRows] = useState<any[]>([]);
  const [radLoading, setRadLoading] = useState(true);
  const [radSearchInput, setRadSearchInput] = useState('');
  const [radSearch, setRadSearch] = useState('');
  const [radPage, setRadPage] = useState(1);
  const [radTotal, setRadTotal] = useState(0);
  const [radTotalPages, setRadTotalPages] = useState(0);
  const [radMode, setRadMode] = useState<'idle' | 'create' | 'edit'>('idle');
  const [radEditingId, setRadEditingId] = useState<number | null>(null);
  const [radForm, setRadForm] = useState<any>(EMPTY_RADIOLOGY);
  const [radSubmitting, setRadSubmitting] = useState(false);

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
        loadLabTests();
      } else {
        toast.success('All demo data already exists — nothing new to add');
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

  const loadRadiology = useCallback(async () => {
    setRadLoading(true);
    const res = await listRadiologyImaging({ search: radSearch, page: radPage, limit: PAGE_LIMIT });
    if (res.success) {
      setRadRows(res.data.rows);
      setRadTotal(res.data.total);
      setRadTotalPages(res.data.totalPages);
    } else {
      toast.error(res.error || 'Failed to load radiology imaging');
    }
    setRadLoading(false);
  }, [radSearch, radPage]);

  useEffect(() => { loadServices(); }, [loadServices]);
  useEffect(() => { loadLabTests(); }, [loadLabTests]);
  useEffect(() => { loadPackages(); }, [loadPackages]);
  useEffect(() => { loadRadiology(); }, [loadRadiology]);

  useEffect(() => {
    getInsuranceProviders().then(res => {
      if (res.success) setTpaProviders((res.data as any[]) || []);
    });
  }, []);

  const loadTpaRates = useCallback(async (providerId: number) => {
    setTpaRateLoading(true);
    const res = await listPackageTpaRates(providerId);
    if (res.success) {
      const data = res.data as any;
      setTpaRateRows(data?.rows || []);
      setTpaExclusiveRows(data?.exclusivePackages || []);
      setTpaRateEdits({});
      setTpaNameEdits({});
    } else {
      toast.error(res.error || 'Failed to load TPA rates');
    }
    setTpaRateLoading(false);
  }, []);

  useEffect(() => {
    if (pkgView === 'tpa_rates' && tpaRateProviderId !== '') {
      loadTpaRates(Number(tpaRateProviderId));
    }
  }, [pkgView, tpaRateProviderId, loadTpaRates]);

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

  useEffect(() => {
    const t = setTimeout(() => { setRadSearch(radSearchInput); setRadPage(1); }, 350);
    return () => clearTimeout(t);
  }, [radSearchInput]);

  // ---- Services handlers ----
  const openCreateSvc = () => { setSvcForm(EMPTY_SERVICE); setSvcMode('create'); };
  const openEditSvc = (row: any) => {
    setSvcEditingId(row.id);
    // Spreading the DB row puts nulls into the form for every nullable column,
    // and React throws on a controlled input whose value is null. Drop the
    // nulls so the EMPTY_SERVICE defaults ('' etc.) survive.
    const nonNull = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null && v !== undefined));
    setSvcForm({ ...EMPTY_SERVICE, ...nonNull, default_rate: Number(row.default_rate ?? 0), tax_rate: Number(row.tax_rate ?? 0) });
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

  const deleteSvc = async (id: number) => {
    if (!confirm('Permanently delete this service? This cannot be undone.')) return;
    const res = await deleteService(id);
    if (res.success) { toast.success('Service deleted'); loadServices(); }
    else toast.error(res.error || 'Failed to delete');
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

  const deleteLabTestHandler = async (id: number) => {
    if (!confirm('Permanently delete this lab test? This cannot be undone.')) return;
    const res = await deleteLabTest(id);
    if (res.success) { toast.success('Lab test deleted'); loadLabTests(); }
    else toast.error(res.error || 'Failed to delete');
  };

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
        ? row.inclusions.map((inc: any) => ({ name: inc.name || '', qty: inc.qty ?? 1, amount: inc.amount ?? 0 }))
        : [{ name: '', qty: 1, amount: 0 }],
    });
    setPkgMode('edit');
  };
  const closePkg = () => { setPkgMode('idle'); setPkgEditingId(null); };

  const deletePkgHandler = async (id: number) => {
    if (!confirm('Permanently delete this package? This cannot be undone.')) return;
    const res = await deletePackage(id);
    if (res.success) { toast.success('Package deleted'); loadPackages(); }
    else toast.error(res.error || 'Failed to delete');
  };

  const submitPkg = async (e: React.FormEvent) => {
    e.preventDefault();
    setPkgSubmitting(true);
    try {
      const payload = {
        ...pkgForm,
        total_amount: Number(pkgForm.total_amount),
        validity_days: Number(pkgForm.validity_days),
        inclusions: pkgForm.inclusions.filter((inc: any) => inc.name.trim() !== '').map((inc: any) => ({ name: inc.name, qty: Number(inc.qty), ...(Number(inc.amount) > 0 ? { amount: Number(inc.amount) } : {}) })),
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
    } catch (err: any) {
      toast.error(err?.message || 'Network error — please check server status');
    } finally {
      setPkgSubmitting(false);
    }
  };

  // ---- TPA Rates handlers ----
  const tpaRateEditCount = new Set([...Object.keys(tpaRateEdits), ...Object.keys(tpaNameEdits)]).size;

  const setTpaRateEdit = (packageId: number, raw: string) => {
    setTpaRateEdits(prev => ({ ...prev, [packageId]: raw }));
  };
  const setTpaNameEdit = (packageId: number, raw: string) => {
    setTpaNameEdits(prev => ({ ...prev, [packageId]: raw }));
  };

  const saveTpaRates = async () => {
    if (tpaRateProviderId === '' || tpaRateEditCount === 0) return;
    setTpaRateSaving(true);
    try {
      const packageIds = new Set([...Object.keys(tpaRateEdits), ...Object.keys(tpaNameEdits)].map(Number));
      const byId = new Map(tpaRateRows.map(r => [r.package_id, r]));
      const rates = Array.from(packageIds).map(packageId => {
        const row = byId.get(packageId);
        const rawAmount = tpaRateEdits[packageId] ?? (row?.tpa_amount != null ? String(row.tpa_amount) : '');
        const rawName = tpaNameEdits[packageId] ?? (row?.tpa_package_name || '');
        return {
          package_id: packageId,
          tpa_amount: rawAmount.trim() === '' ? null : Number(rawAmount),
          tpa_package_name: rawName.trim() === '' ? null : rawName.trim(),
        };
      });
      const res = await bulkUpsertPackageTpaRates(Number(tpaRateProviderId), rates);
      if (res.success) {
        toast.success(`Saved ${(res.data as any).upserted} rate(s)`);
        await loadTpaRates(Number(tpaRateProviderId));
      } else {
        toast.error(res.error || 'Failed to save TPA rates');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Network error — please check server status');
    } finally {
      setTpaRateSaving(false);
    }
  };

  // ---- Exclusive package handlers ----
  const openCreateExcPkg = () => { setExcPkgForm({ package_code: '', package_name: '', total_amount: 0, validity_days: 7, description: '' }); setExcPkgEditingId(null); setExcPkgMode('create'); };
  const openEditExcPkg = (row: any) => {
    setExcPkgEditingId(row.id);
    setExcPkgForm({
      package_code: row.package_code, package_name: row.package_name,
      total_amount: Number(row.total_amount ?? 0), validity_days: Number(row.validity_days ?? 7),
      description: row.description || '',
    });
    setExcPkgMode('edit');
  };
  const closeExcPkg = () => { setExcPkgMode('idle'); setExcPkgEditingId(null); };

  const submitExcPkg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tpaRateProviderId === '') return;
    setExcPkgSubmitting(true);
    try {
      const payload = {
        ...excPkgForm,
        total_amount: Number(excPkgForm.total_amount),
        validity_days: Number(excPkgForm.validity_days),
      };
      const res = excPkgMode === 'create'
        ? await createExclusivePackage(Number(tpaRateProviderId), payload)
        : await updateExclusivePackage(excPkgEditingId!, payload);
      if (res.success) {
        toast.success(excPkgMode === 'create' ? 'Exclusive package created' : 'Exclusive package updated');
        closeExcPkg();
        await loadTpaRates(Number(tpaRateProviderId));
      } else {
        toast.error(res.error || 'Failed to save package');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Network error — please check server status');
    } finally {
      setExcPkgSubmitting(false);
    }
  };

  const deleteExcPkgHandler = async (id: number) => {
    if (tpaRateProviderId === '') return;
    if (!confirm('Permanently delete this exclusive package? This cannot be undone.')) return;
    const res = await deleteExclusivePackage(id);
    if (res.success) { toast.success('Package deleted'); await loadTpaRates(Number(tpaRateProviderId)); }
    else toast.error(res.error || 'Failed to delete');
  };

  // Export the current provider's rate sheet to .xlsx. Columns mirror the
  // import format 1:1 (Package Code / Package Name / Cash Rate / TPA Rate) so
  // an exported file can be edited offline and re-imported without remapping.
  const exportTpaRates = () => {
    if (tpaRateProviderId === '' || tpaRateRows.length === 0) return;
    setTpaRateExporting(true);
    try {
      const provider = tpaProviders.find(p => p.id === Number(tpaRateProviderId));
      const headers = ['Package Code', 'Package Name', 'Cash Rate', 'TPA Rate', 'TPA Package Name'];
      const data = tpaRateRows.map(r => ({
        'Package Code': r.package_code,
        'Package Name': r.package_name,
        'Cash Rate': Number(r.total_amount),
        // Leave TPA Rate blank (not 0) when no override exists, so a blank
        // cell round-trips as "no override" instead of "override to 0".
        'TPA Rate': tpaRateEdits[r.package_id] !== undefined
          ? (tpaRateEdits[r.package_id].trim() === '' ? '' : Number(tpaRateEdits[r.package_id]))
          : (r.tpa_amount != null ? Number(r.tpa_amount) : ''),
        'TPA Package Name': tpaNameEdits[r.package_id] !== undefined
          ? tpaNameEdits[r.package_id]
          : (r.tpa_package_name || ''),
      }));
      const ws = XLSX.utils.json_to_sheet(data, { header: headers });
      ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 2, 16) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'TPA Rates');
      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = new Date().toISOString().slice(0, 10);
      const providerSlug = (provider?.provider_code || provider?.provider_name || 'provider').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
      a.href = url;
      a.download = `tpa-rates-${providerSlug}-${ts}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${tpaRateRows.length} package rate${tpaRateRows.length !== 1 ? 's' : ''}.`);
    } catch (e: any) {
      toast.error('Export failed: ' + (e?.message || 'unknown error'));
    } finally {
      setTpaRateExporting(false);
    }
  };

  // Import a rate sheet: read the workbook client-side, match each row back to
  // a package by Package Code (not id — ids aren't stable/visible enough for a
  // human to edit safely offline), stage matches as edits, then reuse the same
  // saveTpaRates() bulk-upsert path used by manual edits.
  const importTpaRates = async (file: File) => {
    if (tpaRateProviderId === '') {
      toast.error('Select a provider before importing.');
      return;
    }
    setTpaRateImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) throw new Error('The uploaded file contains no sheets');
      const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '', raw: false });
      if (rows.length === 0) throw new Error('The uploaded file contains no data rows');

      const byCode = new Map(tpaRateRows.map(r => [r.package_code.trim().toLowerCase(), r]));
      const rateEdits: Record<number, string> = {};
      const nameEdits: Record<number, string> = {};
      const errors: string[] = [];
      let matched = 0;

      rows.forEach((row, i) => {
        const rowNum = i + 2; // account for header row
        const rawCode = String(row['Package Code'] ?? '').trim();
        if (!rawCode) return; // skip blank rows
        const pkg = byCode.get(rawCode.toLowerCase());
        if (!pkg) {
          errors.push(`Row ${rowNum}: unknown Package Code "${rawCode}"`);
          return;
        }
        const rawRate = String(row['TPA Rate'] ?? '').trim();
        if (rawRate !== '' && Number.isNaN(Number(rawRate))) {
          errors.push(`Row ${rowNum}: "${rawRate}" is not a valid TPA Rate`);
          return;
        }
        rateEdits[pkg.package_id] = rawRate;
        nameEdits[pkg.package_id] = String(row['TPA Package Name'] ?? '').trim();
        matched += 1;
      });

      if (errors.length > 0) {
        toast.error(`${errors.length} row${errors.length !== 1 ? 's' : ''} skipped: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '…' : ''}`);
      }
      if (matched === 0) {
        toast.error('No matching packages found in the file.');
        return;
      }

      // Stage the matches as pending edits, then save immediately — mirrors the
      // manual-edit flow (edits state -> saveTpaRates) rather than a separate
      // import codepath, so the same bulk-upsert action and audit log apply.
      const rates = Object.entries(rateEdits).map(([packageIdStr, raw]) => ({
        package_id: Number(packageIdStr),
        tpa_amount: raw.trim() === '' ? null : Number(raw),
        tpa_package_name: nameEdits[Number(packageIdStr)]?.trim() || null,
      }));
      setTpaRateSaving(true);
      const res = await bulkUpsertPackageTpaRates(Number(tpaRateProviderId), rates);
      if (res.success) {
        toast.success(`Imported ${matched} rate${matched !== 1 ? 's' : ''} (${(res.data as any).upserted} saved, ${(res.data as any).deleted} cleared).`);
        setTpaRateEdits({});
        await loadTpaRates(Number(tpaRateProviderId));
      } else {
        toast.error(res.error || 'Failed to save imported rates');
      }
    } catch (e: any) {
      toast.error('Import failed: ' + (e?.message || 'unknown error'));
    } finally {
      setTpaRateSaving(false);
      setTpaRateImporting(false);
      if (tpaRateFileRef.current) tpaRateFileRef.current.value = '';
    }
  };

  // ---- Radiology/Imaging handlers ----
  const openCreateRad = () => { setRadForm(EMPTY_RADIOLOGY); setRadMode('create'); };
  const openEditRad = (row: any) => {
    setRadEditingId(row.id);
    setRadForm({
      ...EMPTY_RADIOLOGY, ...row,
      price: Number(row.price ?? 0),
      tax_rate: Number(row.tax_rate ?? 0),
    });
    setRadMode('edit');
  };
  const closeRad = () => { setRadMode('idle'); setRadEditingId(null); };

  const deleteRadHandler = async (id: number) => {
    if (!confirm('Permanently delete this procedure? This cannot be undone.')) return;
    const res = await deleteRadiologyImaging(id);
    if (res.success) { toast.success('Procedure deleted'); loadRadiology(); }
    else toast.error(res.error || 'Failed to delete');
  };

  const submitRad = async (e: React.FormEvent) => {
    e.preventDefault();
    setRadSubmitting(true);
    const payload = {
      ...radForm,
      price: Number(radForm.price),
      tax_rate: Number(radForm.tax_rate),
    };
    const res = radMode === 'create'
      ? await createRadiologyImaging(payload)
      : await updateRadiologyImaging(radEditingId!, payload);
    if (res.success) {
      toast.success(radMode === 'create' ? 'Procedure created' : 'Procedure updated');
      closeRad();
      loadRadiology();
    } else {
      toast.error(res.error || 'Failed');
    }
    setRadSubmitting(false);
  };

  const TABS: { key: SubTab; label: string }[] = [
    { key: 'services', label: 'Services' },
    { key: 'labtests', label: 'Lab Tests' },
    { key: 'radiology', label: 'Radiology/Imaging' },
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
              <MasterExportButton
                type="service_master"
                filename="services"
                sheetName="Services"
                fetchRows={async () => {
                  const res = await listServices({ search: svcSearch, limit: 100000 });
                  return res.success ? ((res.data?.rows as any[]) ?? []) : [];
                }}
              />
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
                  {['Code', 'Name', 'Category', 'Rate', 'Tax%', 'Rendered By', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {svcLoading ? (
                  <tr><td colSpan={8} className="text-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-500 mx-auto" /></td></tr>
                ) : svcRows.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12 text-gray-400">No services found</td></tr>
                ) : svcRows.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.service_code}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{r.service_name}</td>
                    <td className="px-4 py-3 text-gray-600">{r.service_category}</td>
                    <td className="px-4 py-3 text-gray-600">₹{Number(r.default_rate).toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-600">{Number(r.tax_rate).toFixed(1)}%</td>
                    <td className="px-4 py-3">
                      {r.requires_rendered_by && (
                        <span className="inline-flex px-2 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700">Required</span>
                      )}
                    </td>
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
                      <button onClick={() => deleteSvc(r.id)} className="p-1.5 hover:bg-red-50 rounded-lg" title="Delete permanently"><Trash2 className="h-4 w-4 text-red-500" /></button>
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
                      onChange={e => setSvcForm((p: any) => ({ ...p, service_code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 30) }))}
                      maxLength={30}
                      pattern="[A-Z0-9_-]{2,30}"
                      title="Use uppercase letters, numbers, underscore or hyphen"
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Service Name *</label>
                    <input type="text" required value={svcForm.service_name}
                      onChange={e => setSvcForm((p: any) => ({ ...p, service_name: sanitizeText(e.target.value) }))}
                      maxLength={100}
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
                      onChange={e => setSvcForm((p: any) => ({ ...p, default_rate: sanitizeMoney(e.target.value) }))}
                      inputMode="decimal"
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">HSN/SAC Code</label>
                    {/* Services saved without an HSN code come back as null, which
                        React rejects for a controlled input. Coerce to '' so
                        editing such a service doesn't throw. */}
                    <input type="text" value={svcForm.hsn_sac_code ?? ''}
                      onChange={e => setSvcForm((p: any) => ({ ...p, hsn_sac_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) }))}
                      maxLength={12}
                      pattern="[A-Z0-9]{4,12}"
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Tax Rate (%)</label>
                    <input type="number" min={0} max={100} step="0.01" value={svcForm.tax_rate}
                      onChange={e => setSvcForm((p: any) => ({ ...p, tax_rate: sanitizeMoney(e.target.value) }))}
                      inputMode="decimal"
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <label className="col-span-2 flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!svcForm.requires_rendered_by}
                      onChange={e => setSvcForm((p: any) => ({ ...p, requires_rendered_by: e.target.checked }))} />
                    Requires Rendered By (doctor must be selected per bill line item)
                  </label>
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
              <MasterExportButton
                type="lab_test_master"
                filename="lab-tests"
                sheetName="Lab Tests"
                fetchRows={async () => {
                  const res = await listLabTests({ search: labSearch, limit: 100000 });
                  return res.success ? ((res.data?.rows as any[]) ?? []) : [];
                }}
              />
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
                    <td className="px-4 py-3 flex gap-2">
                      <button onClick={() => openEditLab(r)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Pencil className="h-4 w-4 text-blue-600" /></button>
                      <button onClick={() => deleteLabTestHandler(r.id)} className="p-1.5 hover:bg-red-50 rounded-lg" title="Delete permanently"><Trash2 className="h-4 w-4 text-red-500" /></button>
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
                      onChange={e => setLabForm((p: any) => ({ ...p, test_name: sanitizeText(e.target.value) }))}
                      maxLength={100}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Price (₹) *</label>
                    <input type="number" required min={0} step="0.01" value={labForm.price}
                      onChange={e => setLabForm((p: any) => ({ ...p, price: sanitizeMoney(e.target.value) }))}
                      inputMode="decimal"
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Category</label>
                    <input type="text" value={labForm.category}
                      onChange={e => setLabForm((p: any) => ({ ...p, category: sanitizeText(e.target.value) }))}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Sample Type</label>
                    <input type="text" value={labForm.sample_type}
                      onChange={e => setLabForm((p: any) => ({ ...p, sample_type: sanitizeText(e.target.value) }))}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Unit</label>
                    <input type="text" value={labForm.unit}
                      onChange={e => setLabForm((p: any) => ({ ...p, unit: sanitizeText(e.target.value) }))}
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
                      onChange={e => setLabForm((p: any) => ({ ...p, hsn_sac_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) }))}
                      maxLength={12}
                      pattern="[A-Z0-9]{4,12}"
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Tax Rate (%)</label>
                    <input type="number" min={0} max={100} step="0.01" value={labForm.tax_rate}
                      onChange={e => setLabForm((p: any) => ({ ...p, tax_rate: sanitizeMoney(e.target.value) }))}
                      inputMode="decimal"
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

      {/* ===== RADIOLOGY/IMAGING TAB ===== */}
      {activeSubTab === 'radiology' && (
        <>
          <div className="flex items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text" value={radSearchInput}
                onChange={e => setRadSearchInput(e.target.value)}
                placeholder="Search by procedure or modality"
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <MasterExportButton
                type="radiology_master"
                filename="radiology-imaging"
                sheetName="Radiology"
                fetchRows={async () => {
                  const res = await exportRadiologyImaging();
                  return (res.data ?? []) as Record<string, unknown>[];
                }}
              />
              <MasterImportButton type="radiology_master" onImportComplete={loadRadiology} />
              <button onClick={openCreateRad}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">
                <Plus className="h-4 w-4" /> Add Procedure
              </button>
            </div>
          </div>

          {/* Create/Edit Modal */}
          {radMode !== 'idle' && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
              <form onSubmit={submitRad} className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
                <h2 className="text-lg font-bold mb-4">{radMode === 'create' ? 'Add Radiology Procedure' : 'Edit Radiology Procedure'}</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Procedure Name *</label>
                    <input type="text" value={radForm.procedure_name} onChange={e => setRadForm({ ...radForm, procedure_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500" required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Procedure Code</label>
                    <input type="text" value={radForm.procedure_code} onChange={e => setRadForm({ ...radForm, procedure_code: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Modality (X-Ray, MRI, CT, etc.)</label>
                    <input type="text" value={radForm.modality} onChange={e => setRadForm({ ...radForm, modality: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500" placeholder="e.g., MRI, CT Scan, X-Ray" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Body Part</label>
                    <input type="text" value={radForm.body_part} onChange={e => setRadForm({ ...radForm, body_part: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500" placeholder="e.g., Chest, Head, Abdomen" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Category</label>
                    <input type="text" value={radForm.category} onChange={e => setRadForm({ ...radForm, category: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Price *</label>
                    <input type="number" value={radForm.price} onChange={e => setRadForm({ ...radForm, price: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500" step="0.01" required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">HSN/SAC Code</label>
                    <input type="text" value={radForm.hsn_sac_code} onChange={e => setRadForm({ ...radForm, hsn_sac_code: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Tax Rate (%)</label>
                    <input type="number" value={radForm.tax_rate} onChange={e => setRadForm({ ...radForm, tax_rate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500" step="0.01" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-600 mb-1">Description</label>
                    <textarea value={radForm.description} onChange={e => setRadForm({ ...radForm, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500" rows={2} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Turnaround Time</label>
                    <input type="text" value={radForm.turnaround_time} onChange={e => setRadForm({ ...radForm, turnaround_time: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500" placeholder="e.g., 2 hours, 1 day" />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
                      <input type="checkbox" checked={radForm.is_available} onChange={e => setRadForm({ ...radForm, is_available: e.target.checked })} />
                      Available
                    </label>
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
                      <input type="checkbox" checked={radForm.requires_prescription} onChange={e => setRadForm({ ...radForm, requires_prescription: e.target.checked })} />
                      Requires Rx
                    </label>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                  <button type="button" onClick={closeRad} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold hover:bg-gray-50">
                    Cancel
                  </button>
                  <button type="submit" disabled={radSubmitting}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {radSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {radMode === 'create' ? 'Create' : 'Update'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-bold text-gray-700">Procedure</th>
                  <th className="px-4 py-3 text-left font-bold text-gray-700">Modality</th>
                  <th className="px-4 py-3 text-left font-bold text-gray-700">Body Part</th>
                  <th className="px-4 py-3 text-right font-bold text-gray-700">Price</th>
                  <th className="px-4 py-3 text-center font-bold text-gray-700">Tax %</th>
                  <th className="px-4 py-3 text-center font-bold text-gray-700">Status</th>
                  <th className="px-4 py-3 text-center font-bold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {radLoading ? (
                  <tr><td colSpan={7} className="text-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-500 mx-auto" /></td></tr>
                ) : radRows.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-400">No procedures found</td></tr>
                ) : radRows.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50 border-b">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.procedure_name}</td>
                    <td className="px-4 py-3 text-gray-600">{r.modality || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{r.body_part || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-900 font-semibold">₹{Number(r.price).toFixed(2)}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{r.tax_rate}%</td>
                    <td className="px-4 py-3 text-center">
                      {r.is_available ? <span className="inline-block px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded">Available</span>
                        : <span className="inline-block px-2 py-1 bg-gray-100 text-gray-700 text-xs font-bold rounded">Inactive</span>}
                    </td>
                    <td className="px-4 py-3 text-center flex justify-center gap-2">
                      <button onClick={() => openEditRad(r)} className="text-blue-600 hover:text-blue-800"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => deleteRadHandler(r.id)} className="text-red-600 hover:text-red-800"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {radTotalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-gray-600">Showing {(radPage - 1) * PAGE_LIMIT + 1} to {Math.min(radPage * PAGE_LIMIT, radTotal)} of {radTotal}</div>
              <div className="flex gap-2">
                <button onClick={() => setRadPage(radPage - 1)} disabled={radPage === 1}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-semibold hover:bg-gray-50 disabled:opacity-50">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button onClick={() => setRadPage(radPage + 1)} disabled={radPage === radTotalPages}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-semibold hover:bg-gray-50 disabled:opacity-50">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ===== PACKAGES TAB ===== */}
      {activeSubTab === 'packages' && (
        <>
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-1 w-fit">
            <button
              onClick={() => setPkgView('list')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${pkgView === 'list' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-800'}`}
            >
              Package List
            </button>
            <button
              onClick={() => setPkgView('tpa_rates')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${pkgView === 'tpa_rates' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-800'}`}
            >
              TPA Rates
            </button>
          </div>

          {pkgView === 'tpa_rates' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 max-w-sm">
                  <label className="block text-xs font-bold text-gray-600 mb-1">TPA / Insurance Provider</label>
                  <select
                    value={tpaRateProviderId}
                    onChange={e => setTpaRateProviderId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full p-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Select a provider…</option>
                    {tpaProviders.map(p => (
                      <option key={p.id} value={p.id}>{p.provider_name}{p.provider_code ? ` (${p.provider_code})` : ''}</option>
                    ))}
                  </select>
                </div>
                {tpaRateProviderId !== '' && (
                  <div className="flex items-center gap-2">
                    <input
                      ref={tpaRateFileRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) importTpaRates(f); }}
                    />
                    <button
                      onClick={openCreateExcPkg}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-600 border border-blue-200 bg-blue-50 rounded-xl hover:bg-blue-100"
                    >
                      <Plus className="h-4 w-4" /> Add Package
                    </button>
                    <button
                      onClick={exportTpaRates}
                      disabled={tpaRateLoading || tpaRateRows.length === 0 || tpaRateExporting}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 disabled:opacity-50"
                    >
                      {tpaRateExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      Export
                    </button>
                    <button
                      onClick={() => tpaRateFileRef.current?.click()}
                      disabled={tpaRateLoading || tpaRateImporting || tpaRateSaving}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 disabled:opacity-50"
                    >
                      {tpaRateImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      Import
                    </button>
                    <button
                      onClick={saveTpaRates}
                      disabled={tpaRateEditCount === 0 || tpaRateSaving}
                      className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {tpaRateSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Save All Changes{tpaRateEditCount > 0 ? ` (${tpaRateEditCount})` : ''}
                    </button>
                  </div>
                )}
              </div>

              {tpaRateProviderId === '' ? (
                <div className="text-center py-16 text-gray-400 text-sm">Select a provider to view or edit its package rates.</div>
              ) : (
                <>
                {tpaExclusiveRows.length > 0 && (
                  <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-gray-200 bg-amber-50 text-[11px] font-bold text-amber-700 uppercase tracking-wide">
                      Exclusive packages — only offered to this TPA
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50/80">
                          {['Code', 'Name', 'Rate', ''].map(h => (
                            <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {tpaExclusiveRows.map(r => (
                          <tr key={r.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.package_code}</td>
                            <td className="px-4 py-3 font-semibold text-gray-900">{r.package_name}</td>
                            <td className="px-4 py-3 text-gray-600">₹{Number(r.total_amount).toFixed(2)}</td>
                            <td className="px-4 py-3 flex gap-2">
                              <button onClick={() => openEditExcPkg(r)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Pencil className="h-4 w-4 text-blue-600" /></button>
                              <button onClick={() => deleteExcPkgHandler(r.id)} className="p-1.5 hover:bg-red-50 rounded-lg" title="Delete permanently"><Trash2 className="h-4 w-4 text-red-500" /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50/80">
                        {['Code', 'Name', 'Cash Rate', 'TPA Rate', 'TPA Name'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {tpaRateLoading ? (
                        <tr><td colSpan={5} className="text-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-500 mx-auto" /></td></tr>
                      ) : tpaRateRows.length === 0 ? (
                        <tr><td colSpan={5} className="text-center py-12 text-gray-400">No active packages found</td></tr>
                      ) : tpaRateRows.map(r => (
                        <tr key={r.package_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.package_code}</td>
                          <td className="px-4 py-3 font-semibold text-gray-900">{r.package_name}</td>
                          <td className="px-4 py-3 text-gray-500">₹{Number(r.total_amount).toFixed(2)}</td>
                          <td className="px-4 py-3">
                            <input
                              type="number" min={0} step="0.01"
                              value={tpaRateEdits[r.package_id] ?? (r.tpa_amount != null ? String(r.tpa_amount) : '')}
                              onChange={e => setTpaRateEdit(r.package_id, e.target.value)}
                              placeholder={String(Number(r.total_amount).toFixed(2))}
                              className="w-32 p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={tpaNameEdits[r.package_id] ?? (r.tpa_package_name || '')}
                              onChange={e => setTpaNameEdit(r.package_id, e.target.value)}
                              placeholder={r.package_name}
                              maxLength={100}
                              className="w-40 p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </div>
          ) : (
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
              <MasterExportButton
                type="package_master"
                filename="packages"
                sheetName="Packages"
                fetchRows={async () => {
                  const res = await listPackages({ search: pkgSearch, limit: 100000 });
                  return res.success ? ((res.data?.rows as any[]) ?? []) : [];
                }}
              />
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
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {r.package_name}
                      {r.exclusive_provider && (
                        <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          {r.exclusive_provider.provider_name} only
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">₹{Number(r.total_amount).toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-600">{r.validity_days}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 rounded-full text-[10px] font-bold ${r.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {r.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 flex gap-2">
                      {r.exclusive_provider ? (
                        <span className="text-[10px] text-gray-400 italic px-1.5 py-1.5">Manage in TPA Rates</span>
                      ) : (
                        <>
                          <button onClick={() => openEditPkg(r)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Pencil className="h-4 w-4 text-blue-600" /></button>
                          <button onClick={() => deletePkgHandler(r.id)} className="p-1.5 hover:bg-red-50 rounded-lg" title="Delete permanently"><Trash2 className="h-4 w-4 text-red-500" /></button>
                        </>
                      )}
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
                      onChange={e => setPkgForm((p: any) => ({ ...p, package_code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 30) }))}
                      maxLength={30}
                      pattern="[A-Z0-9_-]{2,30}"
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Package Name *</label>
                    <input type="text" required value={pkgForm.package_name}
                      onChange={e => setPkgForm((p: any) => ({ ...p, package_name: sanitizeText(e.target.value) }))}
                      maxLength={100}
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
                      onChange={e => setPkgForm((p: any) => ({ ...p, total_amount: sanitizeMoney(e.target.value) }))}
                      inputMode="decimal"
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Validity (days)</label>
                    <input type="number" min={1} value={pkgForm.validity_days}
                      onChange={e => setPkgForm((p: any) => ({ ...p, validity_days: sanitizeInteger(e.target.value) }))}
                      inputMode="numeric"
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
                      <div className="flex gap-2 items-center text-xs font-bold text-gray-500 uppercase tracking-wider px-1">
                        <span className="flex-1">Service / Item</span>
                        <span className="w-16 text-center">Qty</span>
                        <span className="w-28 text-center">Amount (₹)</span>
                        <span className="w-8" />
                      </div>
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
                            className="w-16 p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-center focus:outline-none"
                          />
                          <input type="number" placeholder="0" min={0} step="0.01"
                            value={inc.amount || ''}
                            onChange={e => setPkgForm((p: any) => { const incl = [...p.inclusions]; incl[i] = { ...incl[i], amount: e.target.value }; return { ...p, inclusions: incl }; })}
                            className="w-28 p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-right focus:outline-none"
                          />
                          <button type="button" onClick={() => setPkgForm((p: any) => ({ ...p, inclusions: p.inclusions.filter((_: any, j: number) => j !== i) }))}
                            className="p-1.5 hover:bg-red-50 rounded-lg text-red-500"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      ))}
                      <button type="button" onClick={() => setPkgForm((p: any) => ({ ...p, inclusions: [...p.inclusions, { name: '', qty: 1, amount: 0 }] }))}
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

          {excPkgMode !== 'idle' && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-lg max-h-[90vh] overflow-y-auto">
                <h2 className="text-lg font-bold mb-1">{excPkgMode === 'create' ? 'Add Exclusive Package' : 'Edit Exclusive Package'}</h2>
                <p className="text-xs text-gray-500 mb-4">
                  Only visible to {tpaProviders.find(p => p.id === Number(tpaRateProviderId))?.provider_name || 'this provider'}.
                </p>
                <form onSubmit={submitExcPkg} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Package Code *</label>
                    <input type="text" required value={excPkgForm.package_code}
                      onChange={e => setExcPkgForm(p => ({ ...p, package_code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 30) }))}
                      maxLength={30}
                      pattern="[A-Z0-9_-]{2,30}"
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Package Name *</label>
                    <input type="text" required value={excPkgForm.package_name}
                      onChange={e => setExcPkgForm(p => ({ ...p, package_name: sanitizeText(e.target.value) }))}
                      maxLength={100}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1">Rate (₹) *</label>
                      <input type="number" required min={0} step="0.01" value={excPkgForm.total_amount}
                        onChange={e => setExcPkgForm(p => ({ ...p, total_amount: Number(sanitizeMoney(e.target.value)) }))}
                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1">Validity (days)</label>
                      <input type="number" min={1} value={excPkgForm.validity_days}
                        onChange={e => setExcPkgForm(p => ({ ...p, validity_days: Number(sanitizeInteger(e.target.value) || '1') }))}
                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Description</label>
                    <textarea rows={2} value={excPkgForm.description}
                      onChange={e => setExcPkgForm(p => ({ ...p, description: e.target.value }))}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none" />
                  </div>
                  <div className="flex gap-3 mt-2">
                    <button type="button" onClick={closeExcPkg}
                      className="flex-1 py-2 px-4 border border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-50">Cancel</button>
                    <button type="submit" disabled={excPkgSubmitting}
                      className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
                      {excPkgSubmitting ? 'Saving…' : 'Save'}
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
