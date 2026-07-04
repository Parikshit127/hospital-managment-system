'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Plus, Trash2, AlertTriangle, Info, Save, Unlock, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '@/app/components/ui/Modal';
import { Input, Textarea } from '@/app/components/ui/Input';
import { Button } from '@/app/components/ui/Button';
import {
    getInvoiceDetail,
    saveInvoiceEdits,
    unlockInvoice,
    getMyRole,
    updateInvoiceDoctor,
} from '@/app/actions/finance-actions';
import { getDoctorsForDropdown } from '@/app/actions/admin-actions';
import { getAllBillableServices } from '@/app/actions/ipd-master-actions';

// Numeric line-item inputs: hide the native number-spinner arrows (they eat the
// cell width and clip the typed value) and use tabular figures + right align so
// the entered amount is always readable.
const NUM_INPUT =
    "w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-right tabular-nums font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

interface EditInvoiceModalProps {
    invoiceId: number;
    isOpen: boolean;
    onClose: () => void;
    onSaved?: () => void;
}

type EditableItem = {
    // Existing item id (set for rows that came from the server)
    id?: number;
    department: string;
    description: string;
    quantity: number;
    unit_price: number;
    discount: number;
    tax_rate: number;
    hsn_sac_code: string | null;
    service_category: string | null;
    // Optional backdate (only used for newly-added rows; ignored for existing)
    service_date?: string;
    // Soft-removed (kept in array so the index stays stable, hidden from UI)
    _removed?: boolean;
    // Original snapshot for diff detection (existing rows only)
    _orig?: {
        department: string;
        description: string;
        quantity: number;
        unit_price: number;
        discount: number;
        tax_rate: number;
        hsn_sac_code: string | null;
        service_category: string | null;
    };
};

type HeaderState = {
    notes: string;
    billing_patient_type: string;
    concession_amount: number;
    concession_reason: string;
    is_inter_state: boolean;
    bill_discount: number;
    discount_remark: string;
    doctor_id: string;
    doctor_name: string;
    invoice_date: string;
};

type CatalogSvc = {
    id: string; service_name: string; service_code: string;
    default_rate: number; tax_rate: number; service_category: string;
    hsn_sac_code: string; source: string;
};

const fmtINR = (n: number) =>
    `₹${Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function blankItem(): EditableItem {
    return {
        department: 'General',
        description: '',
        quantity: 1,
        unit_price: 0,
        discount: 0,
        tax_rate: 0,
        hsn_sac_code: null,
        service_category: null,
    };
}

function rowDirty(it: EditableItem): boolean {
    if (!it._orig) return false;
    return (
        it.department !== it._orig.department ||
        it.description !== it._orig.description ||
        Number(it.quantity) !== Number(it._orig.quantity) ||
        Number(it.unit_price) !== Number(it._orig.unit_price) ||
        Number(it.discount) !== Number(it._orig.discount) ||
        Number(it.tax_rate) !== Number(it._orig.tax_rate) ||
        (it.hsn_sac_code || null) !== (it._orig.hsn_sac_code || null) ||
        (it.service_category || null) !== (it._orig.service_category || null)
    );
}

export function EditInvoiceModal({ invoiceId, isOpen, onClose, onSaved }: EditInvoiceModalProps) {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [invoiceMeta, setInvoiceMeta] = useState<{
        id: number;
        invoice_number: string;
        status: string;
        paid_amount: number;
        version: number;
        patient_name?: string;
        tpa_claim_status?: string | null;
        tpa_settled_amount?: number;
    } | null>(null);

    const [items, setItems] = useState<EditableItem[]>([]);
    const [header, setHeader] = useState<HeaderState | null>(null);
    const [headerOrig, setHeaderOrig] = useState<HeaderState | null>(null);

    // Overall (whole-bill) discount controls
    const [discMode, setDiscMode] = useState<'pct' | 'amt'>('pct');
    const [discInput, setDiscInput] = useState<number>(0);

    // Hard-lock state + viewer role (only Admin/Finance can unlock).
    const [isLocked, setIsLocked] = useState(false);
    // Bill with any payment collected (Partial or fully Paid): editable by Admin/Finance only
    // (reception/OPD see a read-only block once money has been collected).
    const [hasPayment, setHasPayment] = useState(false);
    const [myRole, setMyRole] = useState<string | null>(null);
    const [unlocking, setUnlocking] = useState(false);
    const [doctors, setDoctors] = useState<Array<{ id: string; name: string; specialty?: string | null }>>([]);
    const [savingDoctor, setSavingDoctor] = useState(false);

    // ─── Service catalog for inline picker on new line items ───
    const [catalogServices, setCatalogServices] = useState<CatalogSvc[]>([]);
    const [activeSvcRow, setActiveSvcRow] = useState<number | null>(null);
    const svcDropdownRef = useRef<HTMLDivElement | null>(null);

    const serviceCategories = useMemo(() =>
        Array.from(new Set(catalogServices.map(s => s.service_category))).sort()
    , [catalogServices]);

    const canUnlock = ['admin', 'finance', 'superadmin'].includes(myRole || '');

    useEffect(() => {
        if (isOpen) {
            getMyRole().then(r => setMyRole(r.role));
            getDoctorsForDropdown().then(r => { if (r.success) setDoctors(r.data as any); });
            getAllBillableServices().then(r => { if (r.success) setCatalogServices(r.data as any); });
        }
    }, [isOpen]);

    const handleUnlock = async () => {
        if (!invoiceMeta) return;
        setUnlocking(true);
        const res = await unlockInvoice(invoiceMeta.id);
        setUnlocking(false);
        if (res.success) { toast.success('Bill unlocked.'); load(); }
        else toast.error(res.error || 'Failed to unlock.');
    };

    // Consulting doctor is non-financial metadata — saved on its own (admin/finance),
    // so it can be changed even on a fully-paid/locked OPD bill.
    const handleSaveDoctor = async () => {
        if (!invoiceMeta || !header) return;
        setSavingDoctor(true);
        const res = await updateInvoiceDoctor(invoiceMeta.id, header.doctor_id || null, header.doctor_name || null);
        setSavingDoctor(false);
        if (res.success) {
            toast.success('Consulting doctor updated.');
            setHeaderOrig(prev => prev ? { ...prev, doctor_id: header.doctor_id, doctor_name: header.doctor_name } : prev);
            onSaved?.();
        } else {
            toast.error(res.error || 'Failed to update doctor.');
        }
    };

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await getInvoiceDetail(invoiceId);
            if (!res.success || !res.data) {
                setError(res.error || 'Failed to load invoice.');
                return;
            }
            const inv: any = res.data;

            // Pre-flight editable check — Locked and Cancelled invoices block edits outright.
            // Bills with any payment collected are editable by Admin/Finance only; the role-gated
            // block is applied at render time (myRole loads asynchronously).
            setIsLocked(!!inv.is_locked);
            setHasPayment(Number(inv.paid_amount ?? 0) > 0);
            if (inv.is_locked) {
                setError('This bill is locked. Only Admin or Finance can unlock it.');
            } else if (inv.status === 'Cancelled') {
                setError('Cancelled invoices cannot be edited. Revert it first if needed.');
            }

            setInvoiceMeta({
                id: inv.id,
                invoice_number: inv.invoice_number,
                status: inv.status,
                paid_amount: Number(inv.paid_amount ?? 0),
                version: Number(inv.version ?? 0),
                patient_name: inv.patient?.full_name,
                tpa_claim_status: inv.tpa_claim_status ?? null,
                tpa_settled_amount: Number(inv.tpa_settled_amount ?? 0),
            });

            const loadedItems: EditableItem[] = (inv.items || []).map((it: any) => {
                const orig = {
                    department: it.department ?? '',
                    description: it.description ?? '',
                    quantity: Number(it.quantity ?? 0),
                    unit_price: Number(it.unit_price ?? 0),
                    discount: Number(it.discount ?? 0),
                    tax_rate: Number(it.tax_rate ?? 0),
                    hsn_sac_code: it.hsn_sac_code ?? null,
                    service_category: it.service_category ?? null,
                };
                return { id: it.id, ...orig, _orig: orig };
            });
            setItems(loadedItems);

            const h: HeaderState = {
                notes: inv.notes ?? '',
                billing_patient_type: inv.billing_patient_type ?? 'Self',
                concession_amount: Number(inv.concession_amount ?? 0),
                concession_reason: inv.concession_reason ?? '',
                is_inter_state: !!inv.is_inter_state,
                bill_discount: Number(inv.bill_discount ?? 0),
                discount_remark: inv.discount_remark ?? '',
                doctor_id: inv.doctor_id ?? '',
                doctor_name: inv.doctor_name ?? '',
                invoice_date: inv.created_at ? new Date(inv.created_at).toISOString().slice(0, 10) : '',
            };
            setHeader(h);
            setHeaderOrig(h);
        } catch (e: any) {
            setError(e?.message || 'Failed to load invoice.');
        } finally {
            setLoading(false);
        }
    }, [invoiceId]);

    useEffect(() => {
        if (isOpen) load();
    }, [isOpen, load]);

    // Close service dropdown on click outside
    useEffect(() => {
        if (activeSvcRow === null) return;
        function handleClickOutside(e: MouseEvent) {
            if (svcDropdownRef.current && !svcDropdownRef.current.contains(e.target as Node)) {
                setActiveSvcRow(null);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [activeSvcRow]);

    // Live totals — match recalculateInvoice on the server (only visible items count)
    const totals = useMemo(() => {
        const visible = items.filter(i => !i._removed);
        let total_amount = 0;
        let total_discount = 0;
        let total_tax = 0;
        let net_items = 0;
        for (const it of visible) {
            const total_price = Number(it.quantity) * Number(it.unit_price);
            const discount = Number(it.discount);
            const net_price = total_price - discount;
            const tax_amount = (net_price * Number(it.tax_rate)) / 100;
            total_amount += total_price;
            total_discount += discount;
            net_items += net_price;
            total_tax += tax_amount;
        }
        // Bill-level (final) discount — flat ₹ off the whole bill, on top of line discounts.
        const billDiscount = Math.min(Math.max(0, Number(header?.bill_discount || 0)), net_items + total_tax);
        const net_amount = net_items + total_tax - billDiscount;
        const isInter = !!header?.is_inter_state;
        return {
            total_amount,
            total_discount: total_discount + billDiscount,
            bill_discount: billDiscount,
            total_tax,
            net_amount,
            cgst: isInter ? 0 : total_tax / 2,
            sgst: isInter ? 0 : total_tax / 2,
            igst: isInter ? total_tax : 0,
            balance_due: Math.max(0, net_amount - Number(invoiceMeta?.paid_amount ?? 0)),
        };
    }, [items, header?.is_inter_state, header?.bill_discount, invoiceMeta?.paid_amount]);

    function updateItem(idx: number, patch: Partial<EditableItem>) {
        setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
    }

    function removeItem(idx: number) {
        setItems(prev => prev.map((it, i) => {
            if (i !== idx) return it;
            // New row (no id) → drop immediately. Existing row → soft-remove.
            return it.id ? { ...it, _removed: true } : { ...it, _removed: true };
        }).filter(it => !(it._removed && !it.id))); // physically drop new-row removals
    }

    function addItem() {
        setItems(prev => [...prev, blankItem()]);
    }

    function getFilteredServices(idx: number) {
        const item = items[idx];
        if (!item) return [];
        const q = (item.description || '').trim().toLowerCase();
        const catFilter = item.service_category || item.department;
        let list = catalogServices;
        if (catFilter && catFilter !== 'General') {
            list = list.filter(s => s.service_category === catFilter);
        }
        if (q) {
            list = list.filter(s =>
                s.service_name.toLowerCase().includes(q) ||
                s.service_code.toLowerCase().includes(q)
            );
        }
        return list.slice(0, 30);
    }

    function pickService(idx: number, svc: CatalogSvc) {
        updateItem(idx, {
            department: svc.service_category,
            description: svc.service_name,
            unit_price: svc.default_rate,
            tax_rate: svc.tax_rate,
            hsn_sac_code: svc.hsn_sac_code,
            service_category: svc.service_category,
        });
        setActiveSvcRow(null);
    }

    // Spread a whole-bill discount (% or flat ₹) across line items by setting each
    // line's Disc ₹. Only positive-value lines participate; this overwrites any
    // existing per-item discounts. Totals/GL stay driven by the same line discounts.
    function applyOverallDiscount() {
        const round2 = (n: number) => Math.round(n * 100) / 100;
        const eligible = items
            .map((it, idx) => ({ it, idx, gross: Number(it.quantity) * Number(it.unit_price) }))
            .filter(({ it, gross }) => !it._removed && gross > 0);
        const grossTotal = eligible.reduce((s, e) => s + e.gross, 0);
        if (eligible.length === 0 || grossTotal <= 0) {
            toast.error('No positive-value items to discount.');
            return;
        }

        const perLine = new Map<number, number>();
        if (discMode === 'pct') {
            const pct = Math.min(100, Math.max(0, Number(discInput) || 0));
            for (const { idx, gross } of eligible) {
                perLine.set(idx, round2((gross * pct) / 100));
            }
        } else {
            const amt = Math.min(Math.max(0, Number(discInput) || 0), grossTotal);
            let allocated = 0;
            eligible.forEach((e, k) => {
                // Proportional share by line value; last line absorbs rounding remainder.
                let share = k === eligible.length - 1
                    ? round2(amt - allocated)
                    : round2((amt * e.gross) / grossTotal);
                share = Math.min(Math.max(0, share), e.gross); // never exceed the line value
                allocated += share;
                perLine.set(e.idx, share);
            });
        }

        setItems(prev => prev.map((it, i) => (perLine.has(i) ? { ...it, discount: perLine.get(i)! } : it)));
        toast.success(
            discMode === 'pct'
                ? `Applied ${Math.min(100, Math.max(0, Number(discInput) || 0))}% discount across items.`
                : 'Distributed discount across items.',
        );
    }

    function headerDirty(): boolean {
        if (!header || !headerOrig) return false;
        return (
            header.notes !== headerOrig.notes ||
            header.billing_patient_type !== headerOrig.billing_patient_type ||
            Number(header.concession_amount) !== Number(headerOrig.concession_amount) ||
            header.concession_reason !== headerOrig.concession_reason ||
            header.is_inter_state !== headerOrig.is_inter_state ||
            Number(header.bill_discount) !== Number(headerOrig.bill_discount) ||
            header.discount_remark !== headerOrig.discount_remark ||
            header.invoice_date !== headerOrig.invoice_date
        );
    }

    async function handleSave() {
        if (!invoiceMeta || !header) return;
        if (tpaLocked) {
            toast.error('TPA settlement is in progress — edit via the TPA workflow only.');
            return;
        }
        setSaving(true);
        try {
            const items_to_update = items
                .filter(it => it.id && !it._removed && rowDirty(it))
                .map(it => ({
                    id: it.id!,
                    department: it.department,
                    description: it.description,
                    quantity: Number(it.quantity),
                    unit_price: Number(it.unit_price),
                    discount: Number(it.discount),
                    tax_rate: Number(it.tax_rate),
                    hsn_sac_code: it.hsn_sac_code,
                    service_category: it.service_category,
                }));
            const items_to_add = items
                .filter(it => !it.id && !it._removed)
                .map(it => ({
                    department: it.department || 'General',
                    description: it.description,
                    quantity: Number(it.quantity),
                    unit_price: Number(it.unit_price),
                    discount: Number(it.discount),
                    tax_rate: Number(it.tax_rate),
                    hsn_sac_code: it.hsn_sac_code,
                    service_category: it.service_category,
                    service_date: it.service_date || undefined,
                }));
            const items_to_remove = items
                .filter(it => it.id && it._removed)
                .map(it => it.id!);

            // Block submit if any add/edit row has empty description or non-positive qty
            const badRow = [...items_to_update, ...items_to_add].find(
                (r: any) => !r.description?.trim() || Number(r.quantity) <= 0,
            );
            if (badRow) {
                toast.error('Each item needs a description and a positive quantity.');
                setSaving(false);
                return;
            }

            const header_diff: any = {};
            if (headerOrig) {
                if (header.notes !== headerOrig.notes) header_diff.notes = header.notes;
                if (header.billing_patient_type !== headerOrig.billing_patient_type)
                    header_diff.billing_patient_type = header.billing_patient_type;
                if (Number(header.concession_amount) !== Number(headerOrig.concession_amount))
                    header_diff.concession_amount = Number(header.concession_amount);
                if (header.concession_reason !== headerOrig.concession_reason)
                    header_diff.concession_reason = header.concession_reason;
                if (header.is_inter_state !== headerOrig.is_inter_state)
                    header_diff.is_inter_state = header.is_inter_state;
                if (Number(header.bill_discount) !== Number(headerOrig.bill_discount))
                    header_diff.bill_discount = Number(header.bill_discount);
                if (header.discount_remark !== headerOrig.discount_remark)
                    header_diff.discount_remark = header.discount_remark;
                if (header.invoice_date && header.invoice_date !== headerOrig.invoice_date)
                    header_diff.invoice_date = header.invoice_date;
            }

            const nothingChanged =
                items_to_update.length === 0 &&
                items_to_add.length === 0 &&
                items_to_remove.length === 0 &&
                Object.keys(header_diff).length === 0;
            if (nothingChanged) {
                toast('No changes to save.', { icon: 'ℹ️' });
                setSaving(false);
                return;
            }

            const res = await saveInvoiceEdits(invoiceMeta.id, {
                expected_version: invoiceMeta.version,
                items_to_update,
                items_to_add,
                items_to_remove,
                header: Object.keys(header_diff).length ? header_diff : undefined,
            });

            if (res.success) {
                toast.success(`Invoice ${invoiceMeta.invoice_number || 'Draft (unsaved)'} updated.`);
                onSaved?.();
                onClose();
            } else {
                toast.error(res.error || 'Failed to save invoice edits.', { duration: 6000 });
            }
        } catch (e: any) {
            toast.error(e?.message || 'Failed to save invoice edits.');
        } finally {
            setSaving(false);
        }
    }

    const isFinal = invoiceMeta?.status === 'Final';
    // TPA settlement guard — once a TPA claim is approved/partial/settled with money
    // already received, the invoice must be driven exclusively through the TPA workflow
    // (Mark TPA Received from the dashboard). Editing line items, billing type, or the
    // bill discount here would silently invalidate the approved amount + split.
    const tpaLocked =
        !!invoiceMeta &&
        ['approved', 'partially_settled', 'settled'].includes(
            String(invoiceMeta.tpa_claim_status ?? '').toLowerCase(),
        ) &&
        Number(invoiceMeta.tpa_settled_amount ?? 0) > 0;
    // Edit access follows the invoice lifecycle, not payment state:
    //   Draft  → any staff may edit (reception can still add services etc.)
    //   Final  → only Admin/Finance/Superadmin
    //   Cancelled → no edits (handled via `error` above)
    const canEditPaid = ['admin', 'finance', 'superadmin'].includes(myRole || '');
    const statusBlocked = invoiceMeta?.status === 'Final' && !canEditPaid;
    const effectiveError =
        error ||
        (statusBlocked
            ? 'Only Admin or Finance can edit a finalized bill.'
            : null);
    const readOnly = !!effectiveError || tpaLocked;

    if (!isOpen) return null;

    return (
        <Modal
            isOpen
            onClose={saving ? () => {} : onClose}
            title={`Edit Invoice${invoiceMeta ? ` — ${invoiceMeta.invoice_number || 'Draft (unsaved)'}` : ''}`}
            icon={<Pencil className="h-4 w-4" />}
            maxWidth="6xl"
        >
            {loading ? (
                <div className="py-12 text-center text-sm text-gray-500">Loading invoice…</div>
            ) : effectiveError ? (
                <div className="space-y-4">
                    <div className="flex items-start gap-2.5 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-3">
                        <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-rose-700 leading-relaxed">{effectiveError}</p>
                    </div>
                    <div className="flex items-center justify-end gap-3">
                        {isLocked && canUnlock && (
                            <Button variant="primary" size="md" onClick={handleUnlock} loading={unlocking} disabled={unlocking} icon={!unlocking ? <Unlock className="h-4 w-4" /> : undefined}>
                                Unlock Bill
                            </Button>
                        )}
                        <Button variant="secondary" size="md" onClick={onClose}>Close</Button>
                    </div>
                </div>
            ) : header && invoiceMeta ? (
                <div className="space-y-5">
                    {/* TPA settlement guard banner */}
                    {tpaLocked && (
                        <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3">
                            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-800 leading-relaxed">
                                TPA settlement is in progress — edit via the TPA workflow only.
                                Use <span className="font-bold">Mark TPA Received</span> from the dashboard to record payments.
                            </p>
                        </div>
                    )}

                    {/* Paid-bill edit warning — privileged editor on a bill with payments */}
                    {hasPayment && !tpaLocked && (
                        <div className="flex items-start gap-2.5 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-3">
                            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                            <p className="text-xs text-rose-700 leading-relaxed">
                                This bill already has <span className="font-bold">{fmtINR(invoiceMeta.paid_amount)}</span> collected.
                                Editing recalculates the balance against the amount already paid. If the new total drops
                                below what's been collected, the difference becomes an <span className="font-bold">overpayment that must be
                                refunded separately</span> (Process Refund / Credit Note). A full audit trail is preserved.
                            </p>
                        </div>
                    )}

                    {/* Status banner */}
                    {isFinal && (
                        <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3">
                            <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-800 leading-relaxed">
                                This invoice is <span className="font-bold">Final</span>.
                                Saving edits will reverse the existing GL journal entry and post a fresh one with the new totals.
                                {invoiceMeta && invoiceMeta.paid_amount > 0 && (
                                    <> The outstanding balance will be recalculated against the already-collected amount of <span className="font-bold">{fmtINR(invoiceMeta.paid_amount)}</span>.</>
                                )}
                                {' '}A full audit trail is preserved.
                            </p>
                        </div>
                    )}

                    {/* Patient + status header */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-gray-50 rounded-xl p-3">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Patient</p>
                            <p className="text-sm font-bold text-gray-900 truncate">{invoiceMeta.patient_name || '—'}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Status</p>
                            <p className="text-sm font-bold text-gray-900">{invoiceMeta.status}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Paid So Far</p>
                            <p className="text-sm font-bold text-gray-900">{fmtINR(invoiceMeta.paid_amount)}</p>
                        </div>
                    </div>

                    {/* Items table */}
                    <div className="border border-gray-200 rounded-xl">
                        <div className="bg-gray-50 px-3 py-2 flex items-center justify-between rounded-t-xl">
                            <p className="text-xs font-bold uppercase tracking-wide text-gray-600">Line Items</p>
                            <Button variant="secondary" size="sm" onClick={addItem} icon={<Plus className="h-3.5 w-3.5" />} disabled={readOnly || saving} title={tpaLocked ? 'Locked — TPA settlement in progress' : undefined}>
                                Add Item
                            </Button>
                        </div>
                        <div className={activeSvcRow !== null ? '' : 'overflow-x-auto'}>
                            <table className="w-full min-w-[960px] text-xs">
                                <thead className="bg-gray-50 border-t border-b border-gray-200 text-gray-500">
                                    <tr>
                                        <th className="px-2 py-2 text-left font-semibold min-w-[120px]">Category</th>
                                        <th className="px-2 py-2 text-left font-semibold min-w-[160px]">Service / Description</th>
                                        <th className="px-2 py-2 text-right font-semibold w-20">Qty</th>
                                        <th className="px-2 py-2 text-right font-semibold w-28">Unit ₹</th>
                                        <th className="px-2 py-2 text-right font-semibold w-28">Disc ₹</th>
                                        <th className="px-2 py-2 text-right font-semibold w-20">Tax %</th>
                                        <th className="px-2 py-2 text-left font-semibold w-40" title="Backdate up to 1 year. Applies to newly-added rows only.">Service Date</th>
                                        <th className="px-2 py-2 text-right font-semibold w-24">Line Net</th>
                                        <th className="px-2 py-2 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((it, idx) => {
                                        if (it._removed) return null;
                                        const lineNet = Number(it.quantity) * Number(it.unit_price) - Number(it.discount);
                                        const lineTax = (lineNet * Number(it.tax_rate)) / 100;
                                        const svcResults = !it.id && activeSvcRow === idx ? getFilteredServices(idx) : [];
                                        return (
                                            <tr key={it.id ?? `new-${idx}`} className="border-b border-gray-100 last:border-b-0">
                                                {/* Department / Category */}
                                                <td className="px-2 py-1.5">
                                                    {!it.id ? (
                                                        <select
                                                            className="w-full px-2 py-1 border border-gray-200 rounded text-xs bg-white"
                                                            value={it.service_category || it.department || 'General'}
                                                            onChange={e => {
                                                                const cat = e.target.value;
                                                                updateItem(idx, {
                                                                    department: cat === 'General' ? 'General' : cat,
                                                                    service_category: cat === 'General' ? null : cat,
                                                                });
                                                            }}
                                                            disabled={readOnly || saving}
                                                        >
                                                            <option value="General">All Categories</option>
                                                            {serviceCategories.map(cat => (
                                                                <option key={cat} value={cat}>{cat}</option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <input
                                                            className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
                                                            value={it.department}
                                                            onChange={e => updateItem(idx, { department: e.target.value })}
                                                            disabled={readOnly || saving}
                                                        />
                                                    )}
                                                </td>
                                                {/* Description / Service search */}
                                                <td className="px-2 py-1.5">
                                                    {!it.id ? (
                                                        <div className="relative" ref={activeSvcRow === idx ? svcDropdownRef : undefined}>
                                                            <div className="relative">
                                                                <input
                                                                    className="w-full pl-2 pr-6 py-1 border border-gray-200 rounded text-xs focus:border-orange-400 focus:ring-1 focus:ring-orange-400/20 outline-none"
                                                                    value={it.description}
                                                                    placeholder="Search services…"
                                                                    onChange={e => {
                                                                        updateItem(idx, { description: e.target.value });
                                                                        if (activeSvcRow !== idx) setActiveSvcRow(idx);
                                                                    }}
                                                                    onFocus={() => setActiveSvcRow(idx)}
                                                                    disabled={readOnly || saving}
                                                                />
                                                                <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none" />
                                                            </div>
                                                            {activeSvcRow === idx && (
                                                                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-y-auto min-w-[280px]">
                                                                    {svcResults.length === 0 ? (
                                                                        <p className="px-3 py-4 text-xs text-gray-400 text-center italic">No services found</p>
                                                                    ) : (
                                                                        svcResults.map(svc => (
                                                                            <button
                                                                                key={svc.id}
                                                                                type="button"
                                                                                className="w-full text-left px-3 py-2 text-xs hover:bg-orange-50 border-b border-gray-50 last:border-b-0 transition-colors"
                                                                                onMouseDown={e => e.preventDefault()}
                                                                                onClick={() => pickService(idx, svc)}
                                                                            >
                                                                                <div className="flex items-center justify-between gap-2">
                                                                                    <span className="font-semibold text-gray-900 truncate">{svc.service_name}</span>
                                                                                    <span className="text-orange-600 font-bold shrink-0">₹{svc.default_rate.toLocaleString('en-IN')}</span>
                                                                                </div>
                                                                                <div className="text-[10px] text-gray-400 mt-0.5">
                                                                                    {svc.service_code && <span>{svc.service_code} · </span>}
                                                                                    {svc.service_category}
                                                                                    {svc.tax_rate > 0 && <span> · {svc.tax_rate}% GST</span>}
                                                                                </div>
                                                                            </button>
                                                                        ))
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <input
                                                            className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
                                                            value={it.description}
                                                            onChange={e => updateItem(idx, { description: e.target.value })}
                                                            disabled={readOnly || saving}
                                                        />
                                                    )}
                                                </td>
                                                <td className="px-2 py-1.5 text-right">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        step="any"
                                                        className={NUM_INPUT}
                                                        value={it.quantity}
                                                        onChange={e => updateItem(idx, { quantity: Number(e.target.value) })}
                                                        disabled={readOnly || saving}
                                                    />
                                                </td>
                                                <td className="px-2 py-1.5 text-right">
                                                    {canEditPaid ? (
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            step="any"
                                                            className={NUM_INPUT}
                                                            value={it.unit_price}
                                                            onChange={e => updateItem(idx, { unit_price: Number(e.target.value) })}
                                                            disabled={readOnly || saving}
                                                        />
                                                    ) : (
                                                        <input
                                                            type="number"
                                                            step="any"
                                                            className={`${NUM_INPUT} bg-gray-50 text-gray-500 cursor-not-allowed`}
                                                            value={it.unit_price}
                                                            readOnly
                                                            title="Item prices cannot be edited. To change the amount, apply a discount or cancel the service and add it again."
                                                        />
                                                    )}
                                                </td>
                                                <td className="px-2 py-1.5 text-right">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        step="any"
                                                        className={NUM_INPUT}
                                                        value={it.discount}
                                                        onChange={e => updateItem(idx, { discount: Number(e.target.value) })}
                                                        disabled={readOnly || saving}
                                                    />
                                                </td>
                                                <td className="px-2 py-1.5 text-right">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={100}
                                                        step="any"
                                                        className={NUM_INPUT}
                                                        value={it.tax_rate}
                                                        onChange={e => updateItem(idx, { tax_rate: Number(e.target.value) })}
                                                        disabled={readOnly || saving}
                                                    />
                                                </td>
                                                <td className="px-2 py-1.5">
                                                    {it.id ? (
                                                        <span className="text-[10px] text-gray-400 italic">existing</span>
                                                    ) : (
                                                        <input
                                                            type="datetime-local"
                                                            className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
                                                            value={it.service_date || ''}
                                                            max={new Date().toISOString().slice(0, 16)}
                                                            onChange={e => updateItem(idx, { service_date: e.target.value })}
                                                            disabled={readOnly || saving}
                                                            title="Leave blank for today. Backdate up to 1 year."
                                                        />
                                                    )}
                                                </td>
                                                <td className="px-2 py-1.5 text-right font-mono text-gray-700">
                                                    {fmtINR(lineNet + lineTax)}
                                                </td>
                                                <td className="px-2 py-1.5 text-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => removeItem(idx)}
                                                        disabled={readOnly || saving}
                                                        className="text-rose-500 hover:text-rose-700 disabled:opacity-30"
                                                        title="Remove item"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {items.filter(i => !i._removed).length === 0 && (
                                        <tr>
                                            <td colSpan={9} className="px-3 py-6 text-center text-gray-400 italic">
                                                No items. Click "Add Item" to insert one.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Overall (whole-bill) discount */}
                    <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1">
                                Overall Discount
                            </label>
                            <div className="flex items-center gap-1.5">
                                <select
                                    value={discMode}
                                    onChange={e => setDiscMode(e.target.value as 'pct' | 'amt')}
                                    disabled={readOnly || saving}
                                    className="px-2 py-1.5 border border-gray-200 rounded text-xs bg-white"
                                >
                                    <option value="pct">%</option>
                                    <option value="amt">₹</option>
                                </select>
                                <input
                                    type="number"
                                    min={0}
                                    step="any"
                                    value={discInput}
                                    onChange={e => setDiscInput(Number(e.target.value))}
                                    disabled={readOnly || saving}
                                    placeholder="0"
                                    className="w-28 px-2 py-1.5 border border-gray-200 rounded text-xs text-right"
                                />
                                <Button variant="secondary" size="sm" onClick={applyOverallDiscount} disabled={readOnly || saving}>
                                    Apply to all items
                                </Button>
                            </div>
                        </div>
                        <p className="text-[10px] text-gray-400 leading-snug max-w-[230px]">
                            Spreads the discount across all line items (overwrites existing per-item discounts). Review, then Save Changes.
                        </p>
                    </div>

                    {/* Final (whole-bill) discount — does NOT touch line/product prices */}
                    <div className="rounded-xl border border-orange-200 bg-orange-50/60 px-3 py-2.5 space-y-2.5">
                        <div className="flex flex-wrap items-end justify-between gap-3">
                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wide text-orange-600 mb-1">
                                    Final Bill Discount (₹)
                                </label>
                                <input
                                    type="number"
                                    min={0}
                                    step="any"
                                    value={header.bill_discount || ''}
                                    onChange={e => setHeader({ ...header, bill_discount: Math.max(0, Number(e.target.value) || 0) })}
                                    disabled={readOnly || saving}
                                    placeholder="0"
                                    className="w-40 px-2 py-1.5 border border-orange-200 rounded text-xs text-right bg-white"
                                />
                            </div>
                            <p className="text-[10px] text-gray-500 leading-snug max-w-[260px]">
                                A flat discount on the final bill total. Line-item prices stay unchanged — it shows as a discount on the bill.
                            </p>
                        </div>
                        {/* Discount Remark */}
                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wide text-orange-600 mb-1">
                                Discount Remark
                            </label>
                            <input
                                type="text"
                                value={header.discount_remark || ''}
                                onChange={e => setHeader({ ...header, discount_remark: e.target.value })}
                                disabled={readOnly || saving}
                                placeholder="Reason for discount (e.g. BPL patient, loyalty, staff)…"
                                className="w-full px-2 py-1.5 border border-orange-200 rounded text-xs bg-white placeholder:text-gray-400"
                            />
                        </div>
                    </div>

                    {/* Consulting Doctor — non-financial; admin/finance can change it even on a paid/locked OPD bill */}
                    <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50/60 px-3 py-2.5">
                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wide text-sky-700 mb-1">
                                Consulting Doctor
                            </label>
                            {(myRole === 'admin' || myRole === 'finance') ? (
                                <div className="flex items-center gap-1.5">
                                    <select
                                        value={header.doctor_id || ''}
                                        onChange={e => {
                                            const id = e.target.value;
                                            const doc = doctors.find(d => d.id === id);
                                            setHeader({ ...header, doctor_id: id, doctor_name: doc?.name || '' });
                                        }}
                                        disabled={savingDoctor}
                                        className="w-56 px-2 py-1.5 border border-sky-200 rounded text-xs bg-white"
                                    >
                                        <option value="">{header.doctor_name ? `Current: ${header.doctor_name}` : '— Select doctor —'}</option>
                                        {doctors.map(d => (
                                            <option key={d.id} value={d.id}>{d.name}{d.specialty ? ` (${d.specialty})` : ''}</option>
                                        ))}
                                    </select>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={handleSaveDoctor}
                                        disabled={savingDoctor || (header.doctor_id === (headerOrig?.doctor_id ?? '') && header.doctor_name === (headerOrig?.doctor_name ?? ''))}
                                    >
                                        {savingDoctor ? 'Saving…' : 'Save'}
                                    </Button>
                                </div>
                            ) : (
                                <p className="text-sm font-medium text-gray-800">{header.doctor_name || '—'}</p>
                            )}
                        </div>
                        <p className="text-[10px] text-gray-500 leading-snug max-w-[260px]">
                            Shown on the bill. Saved on its own — admin/finance can change it even after the bill is paid. IPD bills take their doctor from the admission (edit on the IPD chart).
                        </p>
                    </div>

                    {/* Live totals */}
                    <div className="bg-gray-50 rounded-xl p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                            <p className="text-gray-500 uppercase tracking-wide font-bold text-[10px]">Gross</p>
                            <p className="text-sm font-bold text-gray-900">{fmtINR(totals.total_amount)}</p>
                        </div>
                        <div>
                            <p className="text-gray-500 uppercase tracking-wide font-bold text-[10px]">Discount</p>
                            <p className="text-sm font-bold text-gray-900">{fmtINR(totals.total_discount)}</p>
                        </div>
                        <div>
                            <p className="text-gray-500 uppercase tracking-wide font-bold text-[10px]">
                                Tax ({header.is_inter_state ? 'IGST' : 'CGST+SGST'})
                            </p>
                            <p className="text-sm font-bold text-gray-900">{fmtINR(totals.total_tax)}</p>
                        </div>
                        <div>
                            <p className="text-gray-500 uppercase tracking-wide font-bold text-[10px]">Net</p>
                            <p className="text-sm font-bold text-emerald-700">{fmtINR(totals.net_amount)}</p>
                        </div>
                    </div>

                    {/* Header fields */}
                    <details className="border border-gray-200 rounded-xl">
                        <summary className="cursor-pointer px-3 py-2 bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-600">
                            Header Details
                        </summary>
                        <div className="p-3 space-y-3">
                            {/* Bill Date — all staff on Draft bills; admin/finance on Final */}
                            {(canEditPaid || invoiceMeta?.status === 'Draft') && (
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-600 mb-1">Bill Date</label>
                                        <input
                                            type="date"
                                            className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs"
                                            value={header.invoice_date}
                                            max={new Date().toISOString().slice(0, 10)}
                                            onChange={e => setHeader({ ...header, invoice_date: e.target.value })}
                                            disabled={readOnly || saving}
                                        />
                                        <p className="text-[10px] text-gray-400 mt-1">Changing this reposts the GL journal entry to the new date.</p>
                                    </div>
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[11px] font-bold text-gray-600 mb-1">Billing Type</label>
                                    <select
                                        value={header.billing_patient_type}
                                        onChange={e => setHeader({ ...header, billing_patient_type: e.target.value })}
                                        className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs"
                                        disabled={readOnly || saving}
                                    >
                                        <option value="cash">Self / Cash</option>
                                        <option value="corporate">Corporate</option>
                                        <option value="tpa_insurance">Insurance / TPA</option>
                                    </select>
                                </div>
                                <div className="flex items-center gap-2 pt-5">
                                    <input
                                        type="checkbox"
                                        id="is_inter_state"
                                        checked={header.is_inter_state}
                                        onChange={e => setHeader({ ...header, is_inter_state: e.target.checked })}
                                        disabled={readOnly || saving}
                                    />
                                    <label htmlFor="is_inter_state" className="text-xs text-gray-700">
                                        Inter-state supply (use IGST instead of CGST+SGST)
                                    </label>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <Input
                                    label="Concession Amount (₹)"
                                    type="number"
                                    min={0}
                                    step="any"
                                    value={header.concession_amount}
                                    onChange={e => setHeader({ ...header, concession_amount: Number(e.target.value) })}
                                    disabled={readOnly || saving}
                                />
                                <Input
                                    label="Concession Reason"
                                    value={header.concession_reason}
                                    onChange={e => setHeader({ ...header, concession_reason: e.target.value })}
                                    disabled={readOnly || saving}
                                />
                            </div>
                            <Textarea
                                label="Notes"
                                rows={2}
                                value={header.notes}
                                onChange={e => setHeader({ ...header, notes: e.target.value })}
                                disabled={readOnly || saving}
                            />
                        </div>
                    </details>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 pt-1">
                        <Button variant="secondary" size="md" onClick={onClose} disabled={saving}>
                            Close
                        </Button>
                        <Button
                            variant="primary"
                            size="md"
                            onClick={handleSave}
                            loading={saving}
                            disabled={readOnly || saving}
                            icon={!saving ? <Save className="h-4 w-4" /> : undefined}
                            title={tpaLocked ? 'Locked — TPA settlement in progress' : undefined}
                        >
                            Save Changes
                        </Button>
                    </div>
                </div>
            ) : null}
        </Modal>
    );
}
