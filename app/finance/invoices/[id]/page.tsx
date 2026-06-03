'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getInvoiceDetail, addInvoiceItem, removeInvoiceItem, finalizeInvoice, cancelInvoice } from '@/app/actions/finance-actions';
import { getAuditLogs } from '@/app/actions/audit-actions';
import { getIpdServices } from '@/app/actions/ipd-master-actions';
import { useToast } from '@/app/components/ui/Toast';

export default function InvoiceDetailPage() {
    const params = useParams();
    const router = useRouter();
    const invoiceId = Number(params.id);
    const toast = useToast();

    const [invoice, setInvoice] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isEditMode, setIsEditMode] = useState(false);

    // Master Services for Editing
    const [services, setServices] = useState<any[]>([]);
    const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [draftPrice, setDraftPrice] = useState<number>(0);
    const [isOpen, setIsOpen] = useState(false);
    const [draftQty, setDraftQty] = useState(1);
    const [draftDiscount, setDraftDiscount] = useState(0);
    const [actionLoading, setActionLoading] = useState(false);

    const [auditLogs, setAuditLogs] = useState<any[]>([]);

    // Cancel invoice modal
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [cancelSubmitting, setCancelSubmitting] = useState(false);

    const loadInvoice = async () => {
        setLoading(true);
        const res = await getInvoiceDetail(invoiceId);
        if (res.success) {
            setInvoice(res.data);
            const auditRes = await getAuditLogs(1, 50, { entity_type: 'invoice', entity_id: res.data.invoice_number });
            if (auditRes.success) {
                setAuditLogs(auditRes.data || []);
            }
        }
        setLoading(false);
    };

    useEffect(() => {
        if (!invoiceId) return;
        loadInvoice();
        getIpdServices().then(res => {
            if (res.success) setServices(res.data);
        });
    }, [invoiceId]);

    const handleAddItem = async () => {
        if (!searchQuery.trim()) return;

        let category = 'General';
        let description = searchQuery.trim();
        let price = draftPrice;
        let taxRate = 0;

        if (selectedServiceId) {
            const svc = services.find(s => s.id === selectedServiceId);
            if (svc) {
                category = svc.service_category || 'General';
                description = svc.service_name;
                taxRate = Number(svc.tax_rate) || 0;
            }
        }

        setActionLoading(true);
        const res = await addInvoiceItem({
            invoice_id: invoiceId,
            department: category,
            description: description,
            quantity: draftQty,
            unit_price: price,
            discount: draftDiscount,
            tax_rate: taxRate,
            service_category: category
        });

        setActionLoading(false);
        if (res.success) {
            toast.success('Item added');
            setSelectedServiceId(null);
            setSearchQuery('');
            setDraftPrice(0);
            setDraftQty(1);
            setDraftDiscount(0);
            await loadInvoice();
        } else {
            toast.error(res.error || 'Failed to add item');
        }
    };

    const handleRemoveItem = async (itemId: number) => {
        setActionLoading(true);
        const res = await removeInvoiceItem(itemId, invoiceId);
        setActionLoading(false);
        if (res.success) {
            toast.success('Item removed');
            await loadInvoice();
        } else {
            toast.error(res.error || 'Failed to remove item');
        }
    };

    const handleCancelSubmit = async () => {
        const trimmed = cancelReason.trim();
        if (trimmed.length < 10) {
            toast.error('Reason must be at least 10 characters.');
            return;
        }
        setCancelSubmitting(true);
        const res = await cancelInvoice(invoiceId, trimmed);
        setCancelSubmitting(false);
        if (res.success) {
            toast.success('Invoice cancelled. Reason recorded in audit log.');
            setShowCancelModal(false);
            setCancelReason('');
            await loadInvoice();
        } else {
            toast.error(res.error || 'Failed to cancel invoice');
        }
    };

    const handleFinalize = async () => {
        if (!confirm('Are you sure you want to finalize this invoice? Once finalized, it cannot be edited.')) return;
        setActionLoading(true);
        const res = await finalizeInvoice(invoiceId);
        setActionLoading(false);
        if (res.success) {
            toast.success('Invoice finalized successfully');
            setIsEditMode(false);
            await loadInvoice();
        } else {
            toast.error(res.error || 'Failed to finalize invoice');
        }
    };

    if (loading) {
        return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Loading invoice...</div>;
    }

    if (!invoice) {
        return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-red-500">Invoice not found or deleted.</div>;
    }

    const fmt = (n: number) => n.toLocaleString('en-IN', { style: 'currency', currency: 'INR' });

    // Group items by category
    const categoryGroups = invoice.items?.reduce((acc: any, item: any) => {
        const cat = item.service_category || item.department || 'Other';
        if (!acc[cat]) acc[cat] = { items: [], total: 0 };
        acc[cat].items.push(item);
        acc[cat].total += (Number(item.net_price) || 0) + (Number(item.tax_amount) || 0);
        return acc;
    }, {} as Record<string, { items: any[]; total: number }>) || {};

    const statusBadge: Record<string, string> = {
        Draft: 'bg-gray-100 text-gray-700',
        Final: 'bg-blue-100 text-blue-700',
        Paid: 'bg-emerald-100 text-emerald-700',
        Partial: 'bg-amber-100 text-amber-700',
        Cancelled: 'bg-red-100 text-red-700',
    };

    return (
        <div className="min-h-screen bg-gray-50 p-4">
            <div className="max-w-5xl mx-auto space-y-4">

                {/* Patient Header */}
                <div className="bg-white rounded-lg shadow p-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">{invoice.patient?.full_name || 'Patient'}</h1>
                            <p className="text-sm text-gray-500">
                                UHID: {invoice.patient_id} | Invoice: {invoice.invoice_number}
                            </p>
                            {invoice.admission && (
                                <p className="text-sm text-gray-500">
                                    Dr. {invoice.admission.doctor_name || 'N/A'} | {invoice.admission.ward_name || 'N/A'} | Bed: {invoice.admission.bed_id || 'N/A'}
                                </p>
                            )}
                            <p className="text-xs text-gray-400">
                                Date: {new Date(invoice.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} |
                                Type: {invoice.invoice_type}
                                {invoice.admission && ` | Admitted: ${new Date(invoice.admission.admission_date).toLocaleDateString('en-IN')}`}
                                {invoice.admission?.diagnosis && ` | Dx: ${invoice.admission.diagnosis}`}
                            </p>
                        </div>
                        <span className={`px-3 py-1 rounded-lg text-sm font-bold ${statusBadge[invoice.status] || 'bg-gray-100 text-gray-700'}`}>
                            {invoice.status}
                        </span>
                    </div>
                </div>

                {/* Cancelled Banner */}
                {invoice.status === 'Cancelled' && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <p className="text-sm font-bold text-red-800">This invoice has been CANCELLED.</p>
                        <p className="text-xs text-red-700 mt-1">
                            Reason: {invoice.notes || '(check audit log)'}
                        </p>
                    </div>
                )}

                {/* Add Item (Edit Mode) */}
                {isEditMode && invoice.status === 'Draft' && (
                    <div className="bg-white rounded-lg shadow p-4 animate-fadeIn">
                        <h2 className="font-semibold text-sm mb-3">Add Service to Bill</h2>
                        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                            <div className="md:col-span-2 relative">
                                <label className="text-xs text-gray-500">Service</label>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={e => {
                                        const query = e.target.value;
                                        setSearchQuery(query);
                                        const exactMatch = services.find(s => s.service_name.toLowerCase() === query.toLowerCase());
                                        if (exactMatch) {
                                            setSelectedServiceId(exactMatch.id);
                                            setDraftPrice(Number(exactMatch.default_rate));
                                        } else {
                                            setSelectedServiceId(null);
                                        }
                                        setIsOpen(true);
                                    }}
                                    onFocus={() => setIsOpen(true)}
                                    onBlur={() => setTimeout(() => setIsOpen(false), 200)}
                                    placeholder="Search or enter manual service..."
                                    className="w-full px-2 py-1.5 border rounded text-sm bg-white"
                                />
                                {isOpen && (
                                    <div className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                                        {services
                                            .filter(s => s.service_name.toLowerCase().includes(searchQuery.toLowerCase()))
                                            .map(s => (
                                                <button
                                                    key={s.id}
                                                    type="button"
                                                    onMouseDown={() => {
                                                        setSearchQuery(s.service_name);
                                                        setSelectedServiceId(s.id);
                                                        setDraftPrice(Number(s.default_rate));
                                                        setIsOpen(false);
                                                    }}
                                                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex justify-between items-center border-b border-gray-100 last:border-0"
                                                >
                                                    <span className="font-medium text-gray-800">{s.service_name}</span>
                                                    <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{fmt(Number(s.default_rate))}</span>
                                                </button>
                                            ))
                                        }
                                        {searchQuery.trim() && !services.some(s => s.service_name.toLowerCase() === searchQuery.toLowerCase()) && (
                                            <button
                                                type="button"
                                                onMouseDown={() => {
                                                    setSelectedServiceId(null);
                                                    setIsOpen(false);
                                                }}
                                                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 text-blue-600 flex items-center gap-1 font-medium"
                                            >
                                                <span>Use custom:</span>
                                                <span className="italic font-normal truncate">"{searchQuery}"</span>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="text-xs text-gray-500">Rate (INR)</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={draftPrice}
                                    onChange={e => setDraftPrice(Number(e.target.value))}
                                    className="w-full px-2 py-1.5 border rounded text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500">Qty</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={draftQty}
                                    onChange={e => setDraftQty(Number(e.target.value))}
                                    className="w-full px-2 py-1.5 border rounded text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500">Discount</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={draftDiscount}
                                    onChange={e => setDraftDiscount(Number(e.target.value))}
                                    className="w-full px-2 py-1.5 border rounded text-sm"
                                />
                            </div>
                            <div className="flex items-end">
                                <button
                                    onClick={handleAddItem}
                                    disabled={!searchQuery.trim() || actionLoading}
                                    className="w-full px-2 py-1.5 bg-blue-600 text-white rounded text-sm font-medium disabled:opacity-50 hover:bg-blue-700"
                                >
                                    {actionLoading ? 'Adding...' : 'Add Item'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Charge Summary */}
                <div className="bg-white rounded-lg shadow p-4">
                    <h2 className="font-semibold text-sm mb-3">Charge Summary</h2>
                    <div className="space-y-1 mb-3">
                        {Object.entries(categoryGroups).map(([cat, data]: [string, any]) => (
                            <details key={cat} className="group">
                                <summary className="flex justify-between text-sm p-2 bg-gray-50 rounded cursor-pointer hover:bg-gray-100">
                                    <span>{cat} <span className="text-gray-400 text-xs">({data.items.length} items)</span></span>
                                    <span className="font-medium">{fmt(data.total)}</span>
                                </summary>
                                <div className="ml-4 mt-1 space-y-0.5">
                                    {data.items.map((item: any) => (
                                        <div key={item.id} className="flex justify-between items-center text-xs py-1.5 px-2 border-l-2 border-gray-200">
                                            <div className="flex-1">
                                                <span className="text-gray-700">{item.description}</span>
                                                <span className="text-gray-400 ml-2">x{item.quantity}</span>
                                                {Number(item.discount) > 0 && <span className="text-green-600 ml-2">-{fmt(Number(item.discount))}</span>}
                                                {Number(item.tax_rate) > 0 && <span className="text-gray-400 ml-2">GST {item.tax_rate}%</span>}
                                                {item.hsn_sac_code && <span className="text-gray-300 ml-2 font-mono">HSN:{item.hsn_sac_code}</span>}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-gray-700">{fmt(Number(item.net_price) + Number(item.tax_amount || 0))}</span>
                                                {isEditMode && (
                                                    <button onClick={() => handleRemoveItem(item.id)} disabled={actionLoading}
                                                        className="text-red-400 hover:text-red-600 text-lg">&times;</button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </details>
                        ))}
                        {(!invoice.items || invoice.items.length === 0) && (
                            <div className="text-center py-8 text-gray-400 text-sm">No items in this bill yet.</div>
                        )}
                    </div>

                    {/* Financial Totals */}
                    <div className="border-t pt-2 space-y-1">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Sub-Total</span>
                            <span>{fmt(Number(invoice.total_amount || 0))}</span>
                        </div>
                        {Number(invoice.total_discount) > 0 && (
                            <div className="flex justify-between text-sm text-green-600">
                                <span>Discount</span>
                                <span>-{fmt(Number(invoice.total_discount))}</span>
                            </div>
                        )}
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">GST</span>
                            <span>{fmt(Number(invoice.total_tax || 0))}</span>
                        </div>
                        {(Number(invoice.cgst_amount) > 0 || Number(invoice.sgst_amount) > 0) && (
                            <div className="flex justify-between text-xs text-gray-400 pl-4">
                                <span>CGST: {fmt(Number(invoice.cgst_amount || 0))} | SGST: {fmt(Number(invoice.sgst_amount || 0))}</span>
                            </div>
                        )}
                        <div className="flex justify-between text-sm font-bold border-t pt-1">
                            <span>NET BILL</span>
                            <span>{fmt(Number(invoice.net_amount || 0))}</span>
                        </div>
                    </div>
                </div>

                {/* Adjustments */}
                <div className="bg-white rounded-lg shadow p-4">
                    <h2 className="font-semibold text-sm mb-3">Payment Summary</h2>
                    <div className="space-y-2">
                        {Number(invoice.paid_amount) > 0 && (
                            <div className="flex justify-between text-sm p-2 bg-green-50 rounded">
                                <span>Paid / Received</span>
                                <span className="text-green-700 font-medium">-{fmt(Number(invoice.paid_amount))}</span>
                            </div>
                        )}
                        <div className={`flex justify-between text-sm font-bold p-3 rounded ${Number(invoice.balance_due) > 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                            <span>BALANCE DUE</span>
                            <span>{fmt(Number(invoice.balance_due || 0))}</span>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="bg-white rounded-lg shadow p-4 flex flex-wrap gap-3">
                    {invoice.status === 'Draft' && !isEditMode && (
                        <button onClick={handleFinalize} disabled={actionLoading}
                            className="px-4 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 text-sm">
                            Finalize Bill
                        </button>
                    )}
                    {invoice.status === 'Draft' && (
                        <button onClick={() => setIsEditMode(!isEditMode)}
                            className={`px-4 py-3 border rounded-lg text-sm font-medium ${isEditMode ? 'bg-gray-200 text-gray-800 border-gray-300' : 'border-gray-300 hover:bg-gray-50'}`}>
                            {isEditMode ? 'Cancel Edit' : 'Edit Draft'}
                        </button>
                    )}
                    {invoice.status !== 'Cancelled' && (
                        <button onClick={() => setShowCancelModal(true)} disabled={actionLoading}
                            className="px-4 py-3 border border-red-300 text-red-700 rounded-lg text-sm hover:bg-red-50 disabled:opacity-50">
                            Cancel Invoice
                        </button>
                    )}
                    {invoice.admission_id && (
                        <>
                            <button
                                onClick={() => window.open(`/api/discharge/${invoice.admission_id}/bill`, '_blank')}
                                className="px-4 py-3 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                                Print Detailed Bill
                            </button>
                            <button
                                onClick={() => window.open(`/api/discharge/${invoice.admission_id}/summary-bill`, '_blank')}
                                className="px-4 py-3 border border-emerald-300 bg-emerald-50 text-emerald-700 rounded-lg text-sm hover:bg-emerald-100">
                                Print Summary Bill
                            </button>
                        </>
                    )}
                    {!invoice.admission_id && (
                        <>
                            <button
                                onClick={() => window.open(`/api/invoice/${invoiceId}/pdf`, '_blank')}
                                className="px-4 py-3 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                                Print Detailed Bill
                            </button>
                            <button
                                onClick={() => window.open(`/api/invoice/${invoiceId}/summary-bill`, '_blank')}
                                className="px-4 py-3 border border-emerald-300 bg-emerald-50 text-emerald-700 rounded-lg text-sm hover:bg-emerald-100">
                                Print Summary Bill
                            </button>
                        </>
                    )}
                    <button onClick={() => router.back()}
                        className="px-4 py-3 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                        Back
                    </button>
                </div>

                {/* Audit Trail */}
                {auditLogs.length > 0 && (
                    <div className="bg-white rounded-lg shadow p-4">
                        <h2 className="font-semibold text-sm mb-3">Audit History</h2>
                        <div className="space-y-1">
                            {auditLogs.map((log: any) => (
                                <div key={log.id} className="flex items-center gap-3 text-xs p-2 bg-gray-50 rounded">
                                    <span className="text-gray-400 font-mono whitespace-nowrap">
                                        {new Date(log.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                                    </span>
                                    <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-bold text-[10px]">
                                        {log.action}
                                    </span>
                                    <span className="text-gray-600">{log.username || 'System'}</span>
                                    <span className="text-gray-400 truncate flex-1" title={log.details || ''}>
                                        {log.details || ''}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Cancel Invoice Modal */}
            {showCancelModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg w-full max-w-lg overflow-hidden shadow-2xl">
                        <div className="p-4 border-b bg-red-50">
                            <h3 className="font-bold text-red-900">Cancel Invoice {invoice.invoice_number}?</h3>
                            <p className="text-xs text-red-700 mt-1">This action cannot be undone. Reason is mandatory.</p>
                        </div>
                        <div className="p-4 space-y-3">
                            <label className="text-xs font-bold uppercase text-gray-600">Cancellation Reason *</label>
                            <textarea
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                rows={4}
                                placeholder="e.g. Duplicate invoice, patient cancelled procedure..."
                                className="w-full p-3 border rounded-lg text-sm"
                                disabled={cancelSubmitting}
                            />
                            <span className={`text-xs ${cancelReason.trim().length < 10 ? 'text-red-600' : 'text-green-700'}`}>
                                {cancelReason.trim().length < 10
                                    ? `${10 - cancelReason.trim().length} more characters required`
                                    : 'Reason looks good'}
                            </span>
                        </div>
                        <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
                            <button
                                onClick={() => { setShowCancelModal(false); setCancelReason(''); }}
                                disabled={cancelSubmitting}
                                className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-100 disabled:opacity-50">
                                Keep Invoice
                            </button>
                            <button
                                onClick={handleCancelSubmit}
                                disabled={cancelSubmitting || cancelReason.trim().length < 10}
                                className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50">
                                {cancelSubmitting ? 'Cancelling...' : 'Confirm Cancellation'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
