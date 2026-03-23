'use client';

import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, Check, Search, User, Info, Loader2 } from 'lucide-react';
import { scheduleFollowUp } from '@/app/actions/doctor-actions';
import { searchPatients } from '@/app/actions/pill-actions';
import { toast } from 'react-hot-toast';

interface Patient {
  patient_id: string;
  full_name: string;
  phone?: string;
}

interface FollowUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: any;
}

export default function FollowUpModal({ isOpen, onClose, session }: FollowUpModalProps) {
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchTerm.length >= 2) {
        setSearching(true);
        const res = await searchPatients(searchTerm);
        if (res.success) {
          setSearchResults(res.data);
        }
        setSearching(false);
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  const [formData, setFormData] = useState({
    scheduledDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    notes: '',
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) {
      toast.error('Please select a patient');
      return;
    }

    setLoading(true);
    try {
      const result = await scheduleFollowUp({
        patientId: selectedPatient.patient_id,
        doctorId: session.id,
        scheduledDate: formData.scheduledDate,
        notes: formData.notes,
      });

      if (result.success) {
        toast.success(`Follow-up scheduled for ${selectedPatient.full_name}`);
        onClose();
        // Reset form
        setSelectedPatient(null);
        setFormData({
          scheduledDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          notes: '',
        });
      } else {
        toast.error(result.error || 'Failed to schedule follow-up');
      }
    } catch (err) {
      toast.error('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="bg-amber-500 p-6 flex justify-between items-center text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Schedule Follow-up</h2>
              <p className="text-white/80 text-sm">Clinical appointment reminder</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Patient Selection */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <User className="w-4 h-4 text-amber-500" /> Patient
            </label>
            {selectedPatient ? (
              <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-200 rounded-full flex items-center justify-center font-bold text-amber-700">
                    {selectedPatient.full_name[0]}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">{selectedPatient.full_name}</p>
                    <p className="text-xs text-amber-600 font-medium">{selectedPatient.patient_id}</p>
                  </div>
                </div>
                <button 
                  type="button" 
                  onClick={() => setSelectedPatient(null)}
                  className="text-amber-600 hover:text-amber-800 text-xs font-bold underline"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-400">
                  <Search className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  placeholder="Search patient name or ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/30 outline-none"
                />
                {(searching || (searchTerm && searchResults.length > 0)) && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                    {searching ? (
                      <div className="p-4 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Searching...
                      </div>
                    ) : (
                      searchResults.map((p) => (
                        <button
                          key={p.patient_id}
                          type="button"
                          onClick={() => {
                            setSelectedPatient(p);
                            setSearchTerm('');
                            setSearchResults([]);
                          }}
                          className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 text-left transition-colors border-b last:border-0"
                        >
                          <User className="w-8 h-8 p-1.5 bg-gray-100 rounded-full text-gray-500" />
                          <div>
                            <p className="text-sm font-bold text-gray-900">{p.full_name}</p>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">{p.patient_id}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" /> Follow-up Date
            </label>
            <input
              required
              type="date"
              value={formData.scheduledDate}
              onChange={(e) => setFormData(prev => ({ ...prev, scheduledDate: e.target.value }))}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Info className="w-4 h-4 text-amber-500" /> Reason for Follow-up / Notes
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Discuss lab results, routine checkup..."
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500/20 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition-all active:scale-95"
            >
              Cancel
            </button>
            <button
              disabled={loading}
              type="submit"
              className="flex-2 py-3 bg-amber-500 text-white font-bold rounded-xl shadow-lg shadow-amber-500/30 hover:bg-amber-600 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Check className="w-5 h-5" /> Schedule Follow-up
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
