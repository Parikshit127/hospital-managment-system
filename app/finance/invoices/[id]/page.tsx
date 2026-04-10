'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { FileText, ArrowLeft, Printer, Edit, Trash2, Plus, CheckCircle, Save, X } from 'lucide-react';
import { getInvoiceDetail, addInvoiceItem, removeInvoiceItem, finalizeInvoice } from '@/app/actions/finance-actions';
import { getIpdServices } from '@/app/actions/ipd-master-actions';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
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
    const [draftQty, setDraftQty] = useState(1);
    const [draftDiscount, setDraftDiscount] = useState(0);
    const [actionLoading, setActionLoading] = useState(false);

    const loadInvoice = async () => {
        setLoading(true);
        const res = await getInvoiceDetail(invoiceId);
        if (res.success) setInvoice(res.data);
        setLoading(false);
    };

    useEffect(() => {
        if (!invoiceId) return;
        loadInvoice();
        getIpdServices().then(res => {
            if (res.success) setServices(res.data);
        });
    }, [invoiceId]);

    const handlePrint = () => {
        window.print();
    };

    const handleAddItem = async () => {
        if (!selectedServiceId) return;
        const svc = services.find(s => s.id === selectedServiceId);
        if (!svc) return;

        setActionLoading(true);
        const res = await addInvoiceItem({
            invoice_id: invoiceId,
            department: svc.service_category || 'General',
            description: svc.service_name,
            quantity: draftQty,
            unit_price: Number(svc.default_rate),
            discount: draftDiscount,
            tax_rate: Number(svc.tax_rate) || 0,
            service_category: svc.service_category
        });
        
        setActionLoading(false);
        if (res.success) {
            toast.success('Item added');
            setSelectedServiceId(null);
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

    if (loading && !invoice) return <AppShell pageTitle="Loading..."><div className="p-12 text-center text-gray-400 font-medium">Scanning Invoice Data...</div></AppShell>;
    if (!invoice) return <AppShell pageTitle="Not Found"><div className="p-12 text-center text-rose-500 font-bold">Invoice records missing or deleted.</div></AppShell>;

    const statusStyle = invoice.status === 'Paid' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
        invoice.status === 'Partial' ? 'bg-amber-100 text-amber-700 border-amber-200' :
            invoice.status === 'Draft' ? 'bg-gray-100 text-gray-700 border-gray-200' :
                invoice.status === 'Cancelled' ? 'bg-rose-100 text-rose-700 border-rose-200' :
                    invoice.status === 'Final' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                    'bg-indigo-100 text-indigo-700 border-indigo-200';

    // Grouping
    const groupedItems = invoice.items?.reduce((acc: any, item: any) => {
        const cat = item.service_category || item.department || 'Other Services';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(item);
        return acc;
    }, {});

    // Compute GST Summaries for proper breakup
    const gstMap = new Map<number, { taxable: number, tax: number }>();
    invoice.items?.forEach((item: any) => {
        if (item.tax_rate > 0) {
            const current = gstMap.get(item.tax_rate) || { taxable: 0, tax: 0 };
            current.taxable += Number(item.net_price);
            current.tax += Number(item.tax_amount || 0);
            gstMap.set(item.tax_rate, current);
        }
    });

    return (
        <AppShell
            pageTitle={`Invoice ${invoice.invoice_number}`}
            pageIcon={<FileText className="h-5 w-5" />}
        >
            <style jsx global>{`
                @media print {
                    @page { margin: 0; size: A4 portrait; }
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white; }
                    /* Hide AppShell layout elements */
                    nav, aside, header { display: none !important; }
                    .print-hidden { display: none !important; }
                    .print-m-0 { margin: 0 !important; max-width: 100% !important; border: none !important; box-shadow: none !important; border-radius: 0 !important; }
                    main { padding: 0 !important; }
                }
            `}</style>

            <div className="max-w-4xl mx-auto print-m-0 print:w-full mb-12">
                
                {/* Print Hidden Toolbar */}
                <div className="flex items-center justify-between mb-6 print-hidden">
                    <Link href="/finance/invoices" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 font-bold transition-colors">
                        <ArrowLeft className="h-4 w-4" /> Back to Ledger
                    </Link>
                    <div className="flex items-center gap-2">
                        {invoice.status === 'Draft' && !isEditMode && (
                            <button onClick={handleFinalize} disabled={actionLoading} className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition-colors shadow-sm disabled:opacity-50">
                                <CheckCircle className="h-4 w-4" /> Finalize Bill
                            </button>
                        )}
                        {invoice.status === 'Draft' && (
                            <button onClick={() => setIsEditMode(!isEditMode)} className={`inline-flex items-center gap-1.5 px-4 py-2 font-bold rounded-xl text-sm transition-colors shadow-sm border ${isEditMode ? 'bg-slate-200 text-slate-800 border-slate-300' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>
                                {isEditMode ? <><X className="h-4 w-4" /> Cancel Edit</> : <><Edit className="h-4 w-4" /> Edit Draft</>}
                            </button>
                        )}
                        <button onClick={handlePrint} className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-sm transition-colors shadow-sm">
                            <Printer className="h-4 w-4" /> Print
                        </button>
                    </div>
                </div>

                {/* Editable Section (Hidden in Print) */}
                {isEditMode && invoice.status === 'Draft' && (
                    <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 mb-8 print-hidden shadow-sm">
                        <h3 className="text-sm font-black text-indigo-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Plus className="h-4 w-4" /> Append Service to Bill
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-1">Master Service</label>
                                <select 
                                    value={selectedServiceId || ''} 
                                    onChange={e => setSelectedServiceId(Number(e.target.value))}
                                    className="w-full p-2.5 bg-white border border-indigo-200 rounded-lg text-sm font-medium outline-none text-indigo-900"
                                >
                                    <option value="">-- Choose --</option>
                                    {services.map(s => (
                                        <option key={s.id} value={s.id}>{s.service_name} (₹{Number(s.default_rate)})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-1">Qty</label>
                                <input 
                                    type="number" min="1" 
                                    value={draftQty} onChange={e => setDraftQty(Number(e.target.value))}
                                    className="w-full p-2.5 bg-white border border-indigo-200 rounded-lg text-sm font-medium outline-none text-indigo-900"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-1">Discount (₹)</label>
                                <input 
                                    type="number" min="0" 
                                    value={draftDiscount} onChange={e => setDraftDiscount(Number(e.target.value))}
                                    className="w-full p-2.5 bg-white border border-indigo-200 rounded-lg text-sm font-medium outline-none text-indigo-900"
                                />
                            </div>
                            <div className="flex items-end">
                                <button 
                                    onClick={handleAddItem}
                                    disabled={!selectedServiceId || actionLoading}
                                    className="w-full p-2.5 bg-indigo-600 text-white rounded-lg text-sm font-bold disabled:opacity-50 hover:bg-indigo-700 transition-colors"
                                >
                                    {actionLoading ? 'Saving...' : 'Add Item'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* THE PRINTABLE INVOICE DOCUMENT */}
                <div className="bg-white border border-gray-200 rounded-2xl print-m-0 p-8 sm:p-12 shadow-md relative">
                    
                    {/* Status Watermark */}
                    {(invoice.status === 'Draft' || invoice.status === 'Cancelled') && (
                        <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none z-0">
                            <span className="text-[150px] font-black uppercase transform -rotate-45">{invoice.status}</span>
                        </div>
                    )}

                    {/* Hospital Branding Header */}
                    <div className="relative z-10 flex flex-col md:flex-row justify-between items-start border-b-2 border-slate-900 pb-8 mb-8">
                        <div>
                            <h1 className="text-3xl font-black text-slate-900 tracking-tight">CITY HOSPITAL</h1>
                            <p className="text-sm font-bold text-slate-500 mt-1">Multi-Specialty Healthcare Center</p>
                            <p className="text-xs text-slate-500 mt-0.5">123 Health Avenue, Medical District, City - 400001</p>
                            <p className="text-xs text-slate-500 mt-0.5">Phone: +91 99999 88888 | info@cityhospital.com</p>
                            <p className="text-xs font-bold text-slate-600 mt-1 uppercase">GSTIN: 27AABCU9603R1ZE</p>
                        </div>
                        <div className="text-right mt-6 md:mt-0">
                            <h2 className="text-3xl font-black text-slate-200 tracking-wider uppercase mb-2">TAX INVOICE</h2>
                            <div className="text-sm font-mono text-slate-700"><span className="font-bold">Bill No:</span> {invoice.invoice_number}</div>
                            <div className="text-sm font-mono text-slate-700"><span className="font-bold">Date:</span> {new Date(invoice.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                            <div className="text-sm font-mono text-slate-700"><span className="font-bold">Type:</span> {invoice.invoice_type} BILLING</div>
                            <div className="mt-2 text-right flex justify-end">
                                <span className={`inline-flex px-3 py-1 text-[11px] uppercase tracking-wider font-bold rounded border print:text-black print:border-black ${statusStyle}`}>
                                    {invoice.status}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Patient Context Block */}
                    <div className="relative z-10 grid grid-cols-2 gap-8 bg-slate-50 border border-slate-200 p-6 rounded-xl mb-8">
                        <div>
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Billed To</h3>
                            <p className="text-lg font-black text-slate-900">{invoice.patient?.full_name}</p>
                            <p className="text-sm text-slate-700 font-medium">UHID: <span className="font-mono">{invoice.patient_id}</span></p>
                            <p className="text-sm text-slate-700 mt-0.5">Contact: {invoice.patient?.phone || 'N/A'}</p>
                        </div>
                        <div className="text-right">
                            {invoice.admission && (
                                <>
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Admission Details</h3>
                                    <p className="text-sm text-slate-700 font-medium">IPD No: <span className="font-mono">{invoice.admission.admission_id}</span></p>
                                    <p className="text-sm text-slate-700">Ward: {invoice.admission.ward_name} · Bed: {invoice.admission.bed_id}</p>
                                    <p className="text-sm text-slate-700">Admitted: {new Date(invoice.admission.admission_date).toLocaleDateString('en-IN')}</p>
                                    <p className="text-sm text-slate-700 font-bold mt-1 max-w-[200px] ml-auto truncate" title={invoice.admission.diagnosis}>Dx: {invoice.admission.diagnosis}</p>
                                </>
                            )}
                            {!invoice.admission && (
                                <>
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Consulting Doctor</h3>
                                    <p className="text-sm text-slate-700 mt-4 italic font-medium">As assigned in OPD</p>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Proper Itemized Break Up */}
                    <div className="relative z-10 mb-8 max-w-[100%] overflow-x-auto">
                        <table className="w-full text-left text-sm print:text-xs">
                            <thead className="bg-slate-900 text-white font-black uppercase text-[10px] tracking-wider">
                                <tr>
                                    <th className="px-4 py-3 rounded-tl-lg">S.No</th>
                                    <th className="px-4 py-3">Particulars & Description</th>
                                    <th className="px-4 py-3 text-right">Qty</th>
                                    <th className="px-4 py-3 text-right">Rate</th>
                                    <th className="px-4 py-3 text-right">Disc</th>
                                    <th className="px-4 py-3 text-right whitespace-nowrap">Taxable</th>
                                    <th className="px-4 py-3 text-right">GST %</th>
                                    <th className="px-4 py-3 text-right rounded-tr-lg">Amount</th>
                                    {isEditMode && <th className="px-4 py-3 print-hidden w-8"></th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {Object.keys(groupedItems).map((category) => (
                                    <React.Fragment key={category}>
                                        <tr className="bg-slate-100">
                                            <td colSpan={isEditMode ? 9 : 8} className="px-4 py-2 font-black text-[11px] text-slate-600 uppercase tracking-widest">{category}</td>
                                        </tr>
                                        {groupedItems[category].map((item: any, idx: number) => (
                                            <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                                                <td className="px-4 py-3 font-mono text-slate-400">{idx + 1}</td>
                                                <td className="px-4 py-3">
                                                    <p className="font-bold text-slate-900">{item.description}</p>
                                                    {(item.ref_id || item.hsn_sac_code) && (
                                                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                                                            {item.hsn_sac_code ? `HSN/SAC: ${item.hsn_sac_code}` : ''} {item.ref_id ? `| Ref: ${item.ref_id}` : ''}
                                                        </p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right font-medium text-slate-700">{item.quantity}</td>
                                                <td className="px-4 py-3 text-right font-medium text-slate-700">₹{Number(item.unit_price).toFixed(2)}</td>
                                                <td className="px-4 py-3 text-right text-rose-500">{Number(item.discount) > 0 ? `-₹${Number(item.discount).toFixed(2)}` : '—'}</td>
                                                <td className="px-4 py-3 text-right font-bold text-slate-700">₹{Number(item.net_price).toFixed(2)}</td>
                                                <td className="px-4 py-3 text-right text-slate-500">{Number(item.tax_rate) > 0 ? `${item.tax_rate}%` : 'EXEMPT'}</td>
                                                <td className="px-4 py-3 text-right font-black text-slate-900">₹{(Number(item.net_price) + Number(item.tax_amount || 0)).toFixed(2)}</td>
                                                {isEditMode && (
                                                    <td className="px-4 py-3 text-right print-hidden">
                                                        <button disabled={actionLoading} onClick={() => handleRemoveItem(item.id)} className="text-slate-300 hover:text-rose-500 transition-colors">
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                ))}
                                {(!invoice.items || invoice.items.length === 0) && (
                                    <tr>
                                        <td colSpan={isEditMode ? 9 : 8} className="px-4 py-12 text-center text-slate-400 font-medium">No items added to this bill yet.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Financial Summary & GST Engine */}
                    <div className="relative z-10 flex flex-col md:flex-row justify-between items-start gap-8 border-t-2 border-slate-900 pt-6">
                        
                        {/* GST Breakup */}
                        <div className="w-full md:w-1/2">
                            {gstMap.size > 0 && (
                                <div className="border border-slate-200 rounded-lg overflow-hidden">
                                    <div className="bg-slate-50 px-3 py-2 border-b border-slate-200">
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">GST Summary Breakup</p>
                                    </div>
                                    <table className="w-full text-left text-xs">
                                        <thead className="bg-white text-slate-500 font-bold border-b border-slate-100">
                                            <tr>
                                                <th className="px-3 py-2">Tax %</th>
                                                <th className="px-3 py-2 text-right">Taxable Amt</th>
                                                <th className="px-3 py-2 text-right">CGST</th>
                                                <th className="px-3 py-2 text-right">SGST</th>
                                                <th className="px-3 py-2 text-right">Tax Total</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {Array.from(gstMap.entries()).map(([rate, vals]) => (
                                                <tr key={rate}>
                                                    <td className="px-3 py-1.5 font-bold text-slate-700">{rate}%</td>
                                                    <td className="px-3 py-1.5 text-right font-mono">₹{vals.taxable.toFixed(2)}</td>
                                                    <td className="px-3 py-1.5 text-right font-mono">₹{(vals.tax / 2).toFixed(2)}</td>
                                                    <td className="px-3 py-1.5 text-right font-mono">₹{(vals.tax / 2).toFixed(2)}</td>
                                                    <td className="px-3 py-1.5 text-right font-mono font-bold">₹{vals.tax.toFixed(2)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            <div className="mt-4">
                                <p className="text-[10px] uppercase font-bold text-slate-400">Amount in Words:</p>
                                <p className="text-xs font-bold text-slate-700 italic mt-0.5">Rupees {convertNumberToWords(Number(invoice.net_amount))} Only.</p>
                            </div>
                        </div>

                        {/* Grand Totals */}
                        <div className="w-full md:w-[350px] space-y-1 bg-slate-50 p-5 rounded-xl border border-slate-200">
                            <div className="flex justify-between text-sm font-bold text-slate-600 mb-1">
                                <span>Subtotal</span>
                                <span className="font-mono">₹{Number(invoice.total_amount).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm font-bold text-rose-500 mb-1">
                                <span>Total Discount</span>
                                <span className="font-mono">-₹{Number(invoice.total_discount).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm font-bold text-slate-600 mb-3 border-b border-slate-300 pb-3">
                                <span>Total Estimated Tax (GST)</span>
                                <span className="font-mono">+₹{Number(invoice.total_tax || 0).toFixed(2)}</span>
                            </div>
                            
                            <div className="flex justify-between items-end">
                                <span className="text-sm font-black text-slate-900 uppercase tracking-widest">Net Bill Amount</span>
                                <span className="text-3xl font-black text-slate-900 tracking-tight">₹{Number(invoice.net_amount).toFixed(2)}</span>
                            </div>

                            <div className="h-4"></div>
                            
                            <div className="flex justify-between text-sm font-bold text-emerald-600">
                                <span>Less: Paid / Advanced</span>
                                <span className="font-mono">₹{Number(invoice.paid_amount || 0).toFixed(2)}</span>
                            </div>
                            
                            <div className="flex justify-between items-end pt-3 mt-1 border-t-2 border-slate-300 border-dashed">
                                <span className={`text-sm font-black uppercase tracking-widest ${Number(invoice.balance_due) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>Balance Payable</span>
                                <span className={`text-xl font-black tracking-tight ${Number(invoice.balance_due) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>₹{Number(invoice.balance_due).toFixed(2)}</span>
                            </div>
                        </div>

                    </div>

                    {/* Print Footer / Terms */}
                    <div className="relative z-10 mt-16 pt-8 break-inside-avoid">
                        <div className="flex justify-between items-end">
                            <div className="w-1/2">
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Terms & Conditions</h4>
                                <ul className="text-[9px] text-slate-500 space-y-1 list-disc pl-3">
                                    <li>All disputes are subject to local jurisdiction only.</li>
                                    <li>Goods/Services once billed cannot be cancelled unless approved by management.</li>
                                    <li>This is a computer generated invoice and does not require a physical signature.</li>
                                </ul>
                            </div>
                            <div className="text-center w-[200px]">
                                <div className="h-16 border-b border-slate-300 mb-2 flex items-end justify-center pb-2">
                                    <span className="text-slate-300 italic font-medium">Digital Signature</span>
                                </div>
                                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Authorized Signatory</p>
                                <p className="text-[9px] text-slate-400 font-bold">For City Hospital</p>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </AppShell>
    );
}

// Simple internal helper for words
function convertNumberToWords(num: number): string {
    if (num === 0) return "Zero";
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    
    // basic converter for common hospital bill sizes
    if (num < 20) return a[Math.floor(num)].trim();
    if (num < 100) return b[Math.floor(num / 10)] + (num % 10 !== 0 ? ' ' + a[Math.floor(num % 10)].trim() : '');
    if (num < 1000) return a[Math.floor(num / 100)].trim() + ' Hundred' + (num % 100 !== 0 ? ' and ' + convertNumberToWords(num % 100) : '');
    if (num < 100000) return convertNumberToWords(num / 1000) + ' Thousand' + (num % 1000 !== 0 ? ' ' + convertNumberToWords(num % 1000) : '');
    if (num < 10000000) return convertNumberToWords(num / 100000) + ' Lakh' + (num % 100000 !== 0 ? ' ' + convertNumberToWords(num % 100000) : '');
    
    return num.toLocaleString('en-IN');
}
