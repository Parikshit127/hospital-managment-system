'use client';

import React, { useState } from 'react';
import { BedGrid } from './BedGrid';
import { createWard, bulkAddBeds, toggleWardActive } from '@/app/admin/ipd-setup/actions';
import { Plus, Settings2, Building2, BedDouble, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/app/components/ui/Button';
import { Modal } from '@/app/components/ui/Modal';
import { Input } from '@/app/components/ui/Input';
import { Select } from '@/app/components/ui/Select';

export function WardManager({ wards, departments, organizationId }: { wards: any[], departments: any[], organizationId: string }) {
    const [expandedWard, setExpandedWard] = useState<number | null>(wards[0]?.ward_id || null);
    
    // Create Ward State
    const [isCreateWardOpen, setIsCreateWardOpen] = useState(false);
    const [wardForm, setWardForm] = useState({ ward_name: '', ward_type: 'General', department_id: '', floor_number: '' });
    
    // Bulk Add Beds State
    const [isAddBedsOpen, setIsAddBedsOpen] = useState(false);
    const [activeWardId, setActiveWardId] = useState<number | null>(null);
    const [bedsForm, setBedsForm] = useState({ start_number: '1', end_number: '10', prefix: 'B-', bed_category: 'Standard', pricing_tier: 'Base' });
    
    const [submitting, setSubmitting] = useState(false);

    const handleCreateWard = async () => {
        if (!wardForm.ward_name) return;
        setSubmitting(true);
        try {
            await createWard(wardForm);
            setIsCreateWardOpen(false);
            setWardForm({ ward_name: '', ward_type: 'General', department_id: '', floor_number: '' });
        } catch (e) {
            console.error("Failed to create ward", e);
        }
        setSubmitting(false);
    };

    const handleBulkAdd = async () => {
        if (!activeWardId) return;
        const start = parseInt(bedsForm.start_number);
        const end = parseInt(bedsForm.end_number);
        if (isNaN(start) || isNaN(end) || start > end) return alert("Invalid bed range");

        setSubmitting(true);
        try {
            await bulkAddBeds({
                ward_id: activeWardId,
                start_number: start,
                end_number: end,
                prefix: bedsForm.prefix,
                bed_category: bedsForm.bed_category,
                pricing_tier: bedsForm.pricing_tier
            });
            setIsAddBedsOpen(false);
            setBedsForm({ start_number: '1', end_number: '10', prefix: 'B-', bed_category: 'Standard', pricing_tier: 'Base' });
        } catch (e: any) {
            alert(e.message || "Failed to add beds");
        }
        setSubmitting(false);
    };

    const handleToggleActive = async (wardId: number, currentStatus: boolean, e: React.MouseEvent) => {
        e.stopPropagation();
        await toggleWardActive(wardId, !currentStatus);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-black text-gray-800">Hospital Wards</h2>
                    <p className="text-xs text-gray-500 font-medium">Configure wards, floors, and bed capacity.</p>
                </div>
                <Button onClick={() => setIsCreateWardOpen(true)} className="flex items-center gap-2">
                    <Plus className="h-4 w-4" /> New Ward
                </Button>
            </div>

            <div className="space-y-4">
                {wards.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400">
                        <Building2 className="mx-auto h-12 w-12 mb-3 opacity-20" />
                        <h3 className="text-sm font-bold">No Wards Configured</h3>
                        <p className="text-xs">Create your first ward to start adding beds.</p>
                    </div>
                ) : (
                    wards.map((ward) => {
                        const isExpanded = expandedWard === ward.ward_id;
                        const beds = ward.beds || [];
                        const available = beds.filter((b: any) => b.status === 'Available').length;
                        const capacityLabel = beds.length > 0 ? `${occupied(beds)}/${beds.length} Occupied` : 'No Beds';
                        
                        return (
                            <div key={ward.ward_id} className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden transition-all duration-200">
                                {/* Header (Accordion Toggle) */}
                                <div 
                                    className={`p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors ${isExpanded ? 'bg-gray-50/50 border-b border-gray-100' : ''}`}
                                    onClick={() => setExpandedWard(isExpanded ? null : ward.ward_id)}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`p-2.5 rounded-xl ${ward.is_active ? 'bg-teal-50 text-teal-600' : 'bg-gray-100 text-gray-400'}`}>
                                            <Building2 className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-black text-gray-800 flex items-center gap-2">
                                                {ward.ward_name}
                                                {!ward.is_active && <span className="text-[10px] bg-gray-200 text-gray-500 px-2 py-0.5 rounded-md uppercase tracking-wide">Inactive</span>}
                                            </h3>
                                            <p className="text-[11px] text-gray-500 font-medium tracking-wide mt-0.5 flex items-center gap-2">
                                                <span className="text-violet-600 font-bold bg-violet-50 px-1.5 py-0.5 rounded">{ward.ward_type}</span>
                                                {ward.floor_number && <span>Floor {ward.floor_number}</span>}
                                                {ward.department?.name && <span>• {ward.department.name}</span>}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-6">
                                        <div className="text-right hidden sm:block">
                                            <p className="text-xs font-black text-gray-700">{capacityLabel}</p>
                                            <p className="text-[10px] text-emerald-500 font-bold">{available} Available</p>
                                        </div>
                                        
                                        <button 
                                            onClick={(e) => handleToggleActive(ward.ward_id, ward.is_active, e)}
                                            className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all ${ward.is_active ? 'bg-white border-rose-200 text-rose-600 hover:bg-rose-50' : 'bg-teal-500 text-white border-teal-600 hover:bg-teal-400'}`}
                                        >
                                            {ward.is_active ? 'Deactivate' : 'Activate'}
                                        </button>
                                        
                                        {isExpanded ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
                                    </div>
                                </div>

                                {/* Content */}
                                {isExpanded && (
                                    <div className="p-5">
                                        <div className="flex justify-between items-center mb-4">
                                            <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                                <BedDouble className="h-4 w-4" /> Visual Bed Map
                                            </h4>
                                            <Button 
                                                variant="secondary" size="sm" 
                                                onClick={() => { setActiveWardId(ward.ward_id); setIsAddBedsOpen(true); }}
                                                className="h-8 text-[11px]"
                                            >
                                                <Plus className="h-3 w-3 mr-1" /> Bulk Add Beds
                                            </Button>
                                        </div>
                                        
                                        <div className="bg-gray-50/50 p-4 rounded-xl border border-gray-100">
                                            <BedGrid beds={beds} wardName={ward.ward_name} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Modals */}
            <Modal isOpen={isCreateWardOpen} onClose={() => setIsCreateWardOpen(false)} title="Create New Ward">
                <div className="space-y-4">
                    <Input label="Ward Name" value={wardForm.ward_name} onChange={(e) => setWardForm({...wardForm, ward_name: e.target.value})} placeholder="e.g. ICU-A" />
                    
                    <Select label="Ward Type" value={wardForm.ward_type} onChange={(e) => setWardForm({...wardForm, ward_type: e.target.value})} options={[
                        {value: 'General', label: 'General / Regular'},
                        {value: 'Critical', label: 'Critical Care (ICU/CCU)'},
                        {value: 'Isolation', label: 'Isolation / Infection'},
                        {value: 'Maternity', label: 'Maternity / NICU'},
                        {value: 'Emergency', label: 'Emergency Overflow'},
                    ]} />
                    
                    <Select label="Linked Department (Optional)" value={wardForm.department_id} onChange={(e) => setWardForm({...wardForm, department_id: e.target.value})} options={[
                        {value: '', label: 'None / Hospital Wide'},
                        ...departments.map(d => ({ value: d.id, label: d.name }))
                    ]} />
                    
                    <Input label="Floor Number" value={wardForm.floor_number} onChange={(e) => setWardForm({...wardForm, floor_number: e.target.value})} placeholder="e.g. Ground, 1st" />
                    
                    <div className="pt-4 flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setIsCreateWardOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateWard} disabled={submitting || !wardForm.ward_name}>Create Ward</Button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isAddBedsOpen} onClose={() => setIsAddBedsOpen(false)} title="Bulk Add Beds">
                <div className="space-y-4">
                    <div className="bg-blue-50 text-blue-800 p-3 rounded-xl text-xs flex gap-2">
                        <Settings2 className="h-4 w-4 shrink-0" />
                        <p>Automatically generates bed IDs from Start to End number. Example: Prefix "ICU-" + Range 1 to 5 = ICU-1, ICU-2, ICU-3, ICU-4, ICU-5.</p>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-3">
                        <Input label="Prefix" value={bedsForm.prefix} onChange={(e) => setBedsForm({...bedsForm, prefix: e.target.value})} placeholder="e.g. B-" />
                        <Input label="Start No." type="number" min="1" value={bedsForm.start_number} onChange={(e) => setBedsForm({...bedsForm, start_number: e.target.value})} />
                        <Input label="End No." type="number" min="1" value={bedsForm.end_number} onChange={(e) => setBedsForm({...bedsForm, end_number: e.target.value})} />
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-4">
                        <Select label="Bed Category" value={bedsForm.bed_category} onChange={(e) => setBedsForm({...bedsForm, bed_category: e.target.value})} options={[
                            {value: 'Standard', label: 'Standard'},
                            {value: 'Semi-Private', label: 'Semi-Private'},
                            {value: 'Private', label: 'Private Single'},
                            {value: 'Deluxe', label: 'Deluxe Suite'},
                            {value: 'Ventilator', label: 'Ventilator Equipped'},
                        ]} />
                        <Select label="Pricing Tier" value={bedsForm.pricing_tier} onChange={(e) => setBedsForm({...bedsForm, pricing_tier: e.target.value})} options={[
                            {value: 'Base', label: 'Base Rate'},
                            {value: 'Premium', label: 'Premium (+50%)'},
                            {value: 'Critical', label: 'Critical (+100%)'},
                        ]} />
                    </div>
                    
                    <div className="pt-4 flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setIsAddBedsOpen(false)}>Cancel</Button>
                        <Button onClick={handleBulkAdd} disabled={submitting}>Generate Beds</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

function occupied(beds: any[]) {
    return beds.filter((b: any) => b.status === 'Occupied').length;
}
