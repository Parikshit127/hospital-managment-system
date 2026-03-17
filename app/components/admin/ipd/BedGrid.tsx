'use client';

import React, { useState } from 'react';
import { BedDouble, Wrench, CheckCircle, AlertCircle, TrendingUp } from 'lucide-react';
import { updateBedStatus } from '@/app/admin/ipd-setup/actions';

export function BedGrid({ beds, wardName }: { beds: any[], wardName: string }) {
    const [loading, setLoading] = useState<string | null>(null);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Available': return 'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200';
            case 'Occupied': return 'bg-violet-100 text-violet-700 border-violet-300';
            case 'Maintenance': return 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200';
            case 'Cleaning': return 'bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200';
            default: return 'bg-gray-100 text-gray-700 border-gray-300';
        }
    };

    const handleStatusToggle = async (bed_id: string, currentStatus: string) => {
        if (currentStatus === 'Occupied') return; // Cannot change occupied from here
        
        setLoading(bed_id);
        try {
            const nextStatus = currentStatus === 'Available' ? 'Maintenance' : 'Available';
            await updateBedStatus(bed_id, nextStatus);
        } catch (e) {
            console.error("Failed to update status", e);
        }
        setLoading(null);
    };

    if (!beds || beds.length === 0) {
        return (
            <div className="py-8 flex flex-col items-center justify-center text-gray-400 border border-dashed border-gray-200 rounded-xl">
                <BedDouble className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm font-medium">No beds configured yet</p>
            </div>
        );
    }

    const available = beds.filter(b => b.status === 'Available').length;
    const occupied = beds.filter(b => b.status === 'Occupied').length;
    
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-4 text-xs font-bold text-gray-500">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-emerald-400"/> {available} Available</div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-violet-400"/> {occupied} Occupied</div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-amber-400"/> {beds.length - available - occupied} Maintenance/Other</div>
            </div>

            <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
                {beds.map((bed) => {
                    // Extract human-readable label from bed_id by stripping org and ward prefix
                    const prefixToStrip = `${bed.organizationId}-${bed.ward_id}-`;
                    const label = bed.bed_id.startsWith(prefixToStrip) 
                        ? bed.bed_id.slice(prefixToStrip.length) 
                        : bed.bed_id;
                    const isOccupied = bed.status === 'Occupied';

                    return (
                        <button
                            key={bed.bed_id}
                            disabled={isOccupied || loading === bed.bed_id}
                            onClick={() => handleStatusToggle(bed.bed_id, bed.status)}
                            className={`relative group flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all duration-200 ${getStatusColor(bed.status)} ${loading === bed.bed_id ? 'opacity-50' : ''}`}
                            title={`Click to toggle Maintenance (Currently: ${bed.status})`}
                        >
                            <BedDouble className="h-6 w-6 mb-1 opacity-80" />
                            <span className="text-[10px] font-black uppercase tracking-wider truncate w-full text-center">
                                {label}
                            </span>
                            
                            {/* Hover info */}
                            {!isOccupied && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                                    {bed.status === 'Available' ? <Wrench className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                                </div>
                            )}

                            {/* Category Badge */}
                            {bed.bed_category && (
                                <span className="absolute -top-2 -right-2 text-[8px] font-bold bg-white text-gray-600 px-1 border rounded-sm shadow-sm">
                                    {bed.bed_category.slice(0, 3)}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
