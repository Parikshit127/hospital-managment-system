'use client';

import React from 'react';
import { Pill, Plus, Printer, Loader2, CheckCircle2 } from 'lucide-react';

const inputCls = "w-full p-3.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/30 outline-none font-medium text-gray-900 placeholder:text-gray-400";

interface PharmacyTabProps {
    medicines: any[];
    pharmacyCart: any[];
    selectedMedicine: string;
    setSelectedMedicine: (v: string) => void;
    medicineQty: number;
    setMedicineQty: (v: number) => void;
    pharmacyOrderResult: any;
    isSubmitting: boolean;
    onAddToCart: () => void;
    onRemoveFromCart: (name: string) => void;
    onPlaceOrder: () => void;
    onPrintPrescription: () => void;
    onNewOrder: () => void;
}

export function PharmacyTab({ medicines, pharmacyCart, selectedMedicine, setSelectedMedicine, medicineQty, setMedicineQty, pharmacyOrderResult, isSubmitting, onAddToCart, onRemoveFromCart, onPlaceOrder, onPrintPrescription, onNewOrder }: PharmacyTabProps) {
    return (
        <div className="max-w-4xl space-y-6">
            <div className="flex gap-8">
                <div className="flex-1 space-y-6">
                    <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-black text-gray-700 flex items-center gap-2"><Pill className="h-5 w-5 text-teal-400" /> Prescribe Medicine</h3>
                            {pharmacyCart.length > 0 && <button onClick={onPrintPrescription} className="text-xs font-bold text-gray-400 flex items-center gap-1 hover:text-gray-600"><Printer className="h-3 w-3" /> Preview Rx</button>}
                        </div>
                        <div className="flex gap-3 mb-4">
                            <select value={selectedMedicine} onChange={e => setSelectedMedicine(e.target.value)} className={`flex-[2] ${inputCls}`}>
                                <option value="" className="bg-white text-gray-900">Select Medicine...</option>{medicines.map((m: any) => <option key={m.id} value={m.brand_name} className="bg-white text-gray-900">{m.brand_name} ({'\u20B9'}{m.price_per_unit})</option>)}
                            </select>
                            <input type="number" min="1" value={medicineQty} onChange={e => setMedicineQty(parseInt(e.target.value) || 1)} className={`w-20 text-center ${inputCls}`} />
                            <button onClick={onAddToCart} disabled={!selectedMedicine} className="bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white p-3 rounded-xl shadow-md active:scale-95 transition-transform"><Plus className="h-5 w-5" /></button>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                            <div className="bg-gray-100 px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] flex justify-between border-b border-gray-200"><span>Current Rx Cart</span><span>{pharmacyCart.length} Items</span></div>
                            {pharmacyCart.length === 0 ? <div className="p-8 text-center text-gray-300 text-sm font-bold">Add medicines to create prescription</div> : (
                                <div className="divide-y divide-gray-100">{pharmacyCart.map((item, idx) => (
                                    <div key={idx} className="p-4 flex justify-between items-center hover:bg-gray-50 transition-colors">
                                        <div><span className="font-bold text-gray-700 text-sm block">{item.name}</span><span className="text-xs text-gray-400">Qty: {item.qty}</span></div>
                                        <button onClick={() => onRemoveFromCart(item.name)} className="text-rose-400 hover:text-rose-300 text-xs font-bold bg-rose-500/10 px-2 py-1 rounded-lg hover:bg-rose-500/20 transition-colors border border-rose-500/20">REMOVE</button>
                                    </div>
                                ))}</div>
                            )}
                            {pharmacyCart.length > 0 && (
                                <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end">
                                    <button onClick={onPlaceOrder} disabled={isSubmitting} className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-sm font-bold px-6 py-3 rounded-xl hover:from-teal-400 hover:to-emerald-500 shadow-lg shadow-teal-500/20 w-full flex justify-center items-center gap-2 disabled:opacity-50">
                                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send to Pharmacy'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                {pharmacyOrderResult && (
                    <div className="flex-1 bg-white border border-gray-200 shadow-sm rounded-2xl p-6 h-fit">
                        <div className="flex items-center gap-3 mb-6 text-emerald-400 font-bold border-b border-gray-200 pb-4">
                            <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center"><CheckCircle2 className="h-6 w-6" /></div>
                            <div><span className="block text-lg">Order Processed</span><span className="text-xs text-emerald-400/60 font-normal">Sent to Pharmacy Queue</span></div>
                        </div>
                        <div className="space-y-4 text-sm">
                            <div className="flex justify-between py-2 border-b border-gray-200"><span className="text-gray-500 font-medium">Total Requested</span><span className="font-bold bg-gray-100 px-2 py-0.5 rounded-lg text-gray-500 border border-gray-200">{pharmacyOrderResult.bill_summary?.total_items_requested}</span></div>
                            <div className="flex justify-between py-2 border-b border-gray-200"><span className="text-gray-500 font-medium">Items Dispensed</span><span className="font-bold text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-lg">{pharmacyOrderResult.bill_summary?.items_dispensed}</span></div>
                            <div className="flex justify-between py-2 border-b border-gray-200"><span className="text-gray-500 font-medium">Unavailable</span><span className="font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-lg">{pharmacyOrderResult.bill_summary?.items_missing}</span></div>
                            <div className="pt-6 flex justify-between items-end"><span className="font-bold text-gray-300 uppercase text-[10px] tracking-[0.15em] block">Total Bill</span><span className="text-3xl font-black text-gray-900 tracking-tight">{'\u20B9'}{pharmacyOrderResult.bill_summary?.total_amount_to_collect}</span></div>
                            <button onClick={onPrintPrescription} className="w-full mt-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 border border-gray-200 flex items-center justify-center gap-2"><Printer className="h-4 w-4" /> Print Receipt</button>
                            <button onClick={onNewOrder} className="w-full py-3 text-gray-400 hover:text-gray-600 text-xs font-bold">New Order</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
