'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2, AlertTriangle, Info, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '@/app/components/ui/Modal';
import { Input, Textarea } from '@/app/components/ui/Input';
import { Button } from '@/app/components/ui/Button';
import {
    getInvoiceDetail,
    saveInvoiceEdits,
} from '@/app/actions/finance-actions';

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
    } | null>(null);

    const [items, setItems] = useState<EditableItem[]>([]);
    const [header, setHeader] = useState<HeaderState | null>(null);
    const [headerOrig, setHeaderOrig] = useState<HeaderState | null>(null);

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

            // Pre-flight editable check — Cancelled or fully paid invoices are hard-locked.
            if (inv.status === 'Cancelled') {
                setError('Cancelled invoices cannot be edited. Revert it first if needed.');
            } else if (Number(inv.balance_due ?? 0) <= 0 && Number(inv.paid_amount ?? 0) > 0) {
                setError('Cannot edit: This invoice is fully paid.');
            }

            setInvoiceMeta({
                id: inv.id,
                invoice_number: inv.invoice_number,
                status: inv.status,
                paid_amount: Number(inv.paid_amount ?? 0),
                version: Number(inv.version ?? 0),
                patient_name: inv.patient?.full_name,
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
        const net_amount = net_items + total_tax;
        const isInter = !!header?.is_inter_state;
        return {
            total_amount,
            total_discount,
            total_tax,
            net_amount,
            cgst: isInter ? 0 : total_tax / 2,
            sgst: isInter ? 0 : total_tax / 2,
            igst: isInter ? total_tax : 0,
            balance_due: Math.max(0, net_amount - Number(invoiceMeta?.paid_amount ?? 0)),
        };
    }, [items, header?.is_inter_state, invoiceMeta?.paid_amount]);

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

    function headerDirty(): boolean {
        if (!header || !headerOrig) return false;
        return (
            header.notes !== headerOrig.notes ||
            header.billing_patient_type !== headerOrig.billing_patient_type ||
            Number(header.concession_amount) !== Number(headerOrig.concession_amount) ||
            header.concession_reason !== headerOrig.concession_reason ||
            header.is_inter_state !== headerOrig.is_inter_state
        );
    }

    async function handleSave() {
        if (!invoiceMeta || !header) return;
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
                toast.success(`Invoice ${invoiceMeta.invoice_number} updated.`);
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
    const readOnly = !!error;

    if (!isOpen) return null;

    return (
        <Modal
            isOpen
            onClose={saving ? () => {} : onClose}
            title={`Edit Invoice${invoiceMeta ? ` — ${invoiceMeta.invoice_number}` : ''}`}
            icon={<Pencil className="h-4 w-4" />}
            maxWidth="2xl"
        >
            {loading ? (
                <div className="py-12 text-center text-sm text-gray-500">Loading invoice…</div>
            ) : error ? (
                <div className="space-y-4">
                    <div className="flex items-start gap-2.5 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-3">
                        <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-rose-700 leading-relaxed">{error}</p>
                    </div>
                    <div className="flex items-center justify-end">
                        <Button variant="secondary" size="md" onClick={onClose}>Close</Button>
                    </div>
                </div>
            ) : header && invoiceMeta ? (
                <div className="space-y-5">
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
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                        <div className="bg-gray-50 px-3 py-2 flex items-center justify-between">
                            <p className="text-xs font-bold uppercase tracking-wide text-gray-600">Line Items</p>
                            <Button variant="secondary" size="sm" onClick={addItem} icon={<Plus className="h-3.5 w-3.5" />} disabled={readOnly || saving}>
                                Add Item
                            </Button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead className="bg-gray-50 border-t border-b border-gray-200 text-gray-500">
                                    <tr>
                                        <th className="px-2 py-2 text-left font-semibold">Department</th>
                                        <th className="px-2 py-2 text-left font-semibold">Description</th>
                                        <th className="px-2 py-2 text-right font-semibold w-16">Qty</th>
                                        <th className="px-2 py-2 text-right font-semibold w-24">Unit ₹</th>
                                        <th className="px-2 py-2 text-right font-semibold w-24">Disc ₹</th>
                                        <th className="px-2 py-2 text-right font-semibold w-16">Tax %</th>
                                        <th className="px-2 py-2 text-right font-semibold w-24">Line Net</th>
                                        <th className="px-2 py-2 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((it, idx) => {
                                        if (it._removed) return null;
                                        const lineNet = Number(it.quantity) * Number(it.unit_price) - Number(it.discount);
                                        const lineTax = (lineNet * Number(it.tax_rate)) / 100;
                                        return (
                                            <tr key={it.id ?? `new-${idx}`} className="border-b border-gray-100 last:border-b-0">
                                                <td className="px-2 py-1.5">
                                                    <input
                                                        className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
                                                        value={it.department}
                                                        onChange={e => updateItem(idx, { department: e.target.value })}
                                                        disabled={saving}
                                                    />
                                                </td>
                                                <td className="px-2 py-1.5">
                                                    <input
                                                        className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
                                                        value={it.description}
                                                        onChange={e => updateItem(idx, { description: e.target.value })}
                                                        disabled={saving}
                                                    />
                                                </td>
                                                <td className="px-2 py-1.5 text-right">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        step="any"
                                                        className="w-full px-2 py-1 border border-gray-200 rounded text-xs text-right"
                                                        value={it.quantity}
                                                        onChange={e => updateItem(idx, { quantity: Number(e.target.value) })}
                                                        disabled={saving}
                                                    />
                                                </td>
                                                <td className="px-2 py-1.5 text-right">
                                                    <input
                                                        type="number"
                                                        step="any"
                                                        className="w-full px-2 py-1 border border-gray-200 rounded text-xs text-right"
                                                        value={it.unit_price}
                                                        onChange={e => updateItem(idx, { unit_price: Number(e.target.value) })}
                                                        disabled={saving}
                                                    />
                                                </td>
                                                <td className="px-2 py-1.5 text-right">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        step="any"
                                                        className="w-full px-2 py-1 border border-gray-200 rounded text-xs text-right"
                                                        value={it.discount}
                                                        onChange={e => updateItem(idx, { discount: Number(e.target.value) })}
                                                        disabled={saving}
                                                    />
                                                </td>
                                                <td className="px-2 py-1.5 text-right">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={100}
                                                        step="any"
                                                        className="w-full px-2 py-1 border border-gray-200 rounded text-xs text-right"
                                                        value={it.tax_rate}
                                                        onChange={e => updateItem(idx, { tax_rate: Number(e.target.value) })}
                                                        disabled={saving}
                                                    />
                                                </td>
                                                <td className="px-2 py-1.5 text-right font-mono text-gray-700">
                                                    {fmtINR(lineNet + lineTax)}
                                                </td>
                                                <td className="px-2 py-1.5 text-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => removeItem(idx)}
                                                        disabled={saving}
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
                                            <td colSpan={8} className="px-3 py-6 text-center text-gray-400 italic">
                                                No items. Click "Add Item" to insert one.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
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
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[11px] font-bold text-gray-600 mb-1">Billing Type</label>
                                    <select
                                        value={header.billing_patient_type}
                                        onChange={e => setHeader({ ...header, billing_patient_type: e.target.value })}
                                        className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs"
                                        disabled={saving}
                                    >
                                        <option value="Self">Self</option>
                                        <option value="Corporate">Corporate</option>
                                        <option value="Insurance">Insurance</option>
                                        <option value="TPA">TPA</option>
                                    </select>
                                </div>
                                <div className="flex items-center gap-2 pt-5">
                                    <input
                                        type="checkbox"
                                        id="is_inter_state"
                                        checked={header.is_inter_state}
                                        onChange={e => setHeader({ ...header, is_inter_state: e.target.checked })}
                                        disabled={saving}
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
                                    disabled={saving}
                                />
                                <Input
                                    label="Concession Reason"
                                    value={header.concession_reason}
                                    onChange={e => setHeader({ ...header, concession_reason: e.target.value })}
                                    disabled={saving}
                                />
                            </div>
                            <Textarea
                                label="Notes"
                                rows={2}
                                value={header.notes}
                                onChange={e => setHeader({ ...header, notes: e.target.value })}
                                disabled={saving}
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
                            disabled={saving}
                            icon={!saving ? <Save className="h-4 w-4" /> : undefined}
                        >
                            Save Changes
                        </Button>
                    </div>
                </div>
            ) : null}
        </Modal>
    );
}
