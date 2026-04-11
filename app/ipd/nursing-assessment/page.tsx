'use client';

import React, { useState, useEffect } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { ClipboardList, Plus, AlertTriangle, User, ChevronRight, X } from 'lucide-react';
import { getIPDAdmissions } from '@/app/actions/ipd-actions';
import { saveNursingAssessment, getNursingAssessments } from '@/app/actions/ipd-nursing-actions';

const ASSESSMENT_TYPES = ['initial', 'daily', 'reassessment'];
const CONSCIOUSNESS_OPTIONS = ['Alert', 'Voice', 'Pain', 'Unresponsive'];
const MOBILITY_OPTIONS = ['Independent', 'Assisted', 'Bedbound', 'Wheelchair'];
const CONTINENCE_OPTIONS = ['Continent', 'Incontinent (Urine)', 'Incontinent (Both)', 'Catheter'];

const INIT_FORM = {
  assessment_type: 'initial',
  consciousness: 'Alert',
  pain_score: 0,
  fall_risk_score: 0,
  braden_score: 23,
  nutrition_screen: '',
  mobility: 'Independent',
  continence: 'Continent',
  notes: '',
};

export default function NursingAssessmentPage() {
  const [admissions, setAdmissions] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(INIT_FORM);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    getIPDAdmissions('Admitted').then(res => {
      if (res.success) setAdmissions(res.data as any[]);
      setLoading(false);
    });
  }, []);

  async function selectAdmission(a: any) {
    setSelected(a);
    setShowForm(false);
    const res = await getNursingAssessments(a.admission_id);
    if (res.success) setAssessments(res.data as any[]);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    const res = await saveNursingAssessment({
      admission_id: selected.admission_id,
      assessment_type: form.assessment_type,
      consciousness: form.consciousness,
      pain_score: form.pain_score,
      fall_risk_score: form.fall_risk_score,
      braden_score: form.braden_score,
      nutrition_screen: form.nutrition_screen,
      mobility: form.mobility,
      continence: form.continence,
    });
    setSaving(false);
    if (res.success) {
      showToast('Assessment saved');
      setShowForm(false);
      setForm(INIT_FORM);
      const r2 = await getNursingAssessments(selected.admission_id);
      if (r2.success) setAssessments(r2.data as any[]);
    } else {
      showToast(res.error || 'Failed to save', 'error');
    }
  }

  const fallRiskLabel = (score: number) =>
    score < 25 ? 'Low Risk' : score < 51 ? 'Moderate Risk' : 'High Risk';
  const bradenLabel = (score: number) =>
    score <= 9 ? 'Very High Risk' : score <= 12 ? 'High Risk' : score <= 14 ? 'Moderate Risk' : score <= 18 ? 'Mild Risk' : 'No Risk';

  return (
    <AppShell>
      <div className="min-h-screen bg-gray-50 p-4">
        {/* Toast */}
        {toast && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl text-white text-sm font-bold shadow-lg ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
            {toast.msg}
          </div>
        )}

        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex items-center gap-3">
            <ClipboardList className="h-6 w-6 text-teal-600" />
            <h1 className="text-xl font-black text-gray-900">Nursing Assessment</h1>
          </div>

          <div className="grid grid-cols-12 gap-4">
            {/* Left: Patient list */}
            <div className="col-span-4 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b bg-gray-50/50">
                <p className="text-xs font-bold text-gray-700">Admitted Patients</p>
              </div>
              <div className="divide-y max-h-[75vh] overflow-y-auto">
                {loading && <p className="text-xs text-gray-400 text-center py-8">Loading…</p>}
                {!loading && admissions.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-8">No admitted patients</p>
                )}
                {admissions.map((a: any) => (
                  <button key={a.admission_id} onClick={() => selectAdmission(a)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${selected?.admission_id === a.admission_id ? 'bg-teal-50 border-l-2 border-teal-500' : ''}`}>
                    <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4 text-teal-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-900 truncate">{a.patient?.full_name}</p>
                      <p className="text-[10px] text-gray-400">{a.wardName ?? 'Ward'} · Bed {a.bed_id}</p>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-gray-300 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Assessment panel */}
            <div className="col-span-8 space-y-4">
              {!selected ? (
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-12 text-center">
                  <ClipboardList className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-400">Select a patient to view or create assessments</p>
                </div>
              ) : (
                <>
                  {/* Patient header */}
                  <div className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center justify-between">
                    <div>
                      <p className="font-black text-gray-900">{selected.patient?.full_name}</p>
                      <p className="text-xs text-gray-400">{selected.wardName} · Bed {selected.bed_id} · {selected.admission_id}</p>
                    </div>
                    <button onClick={() => setShowForm(v => !v)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 text-white text-xs font-bold rounded-xl hover:bg-teal-700">
                      {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                      {showForm ? 'Cancel' : 'New Assessment'}
                    </button>
                  </div>

                  {/* New assessment form */}
                  {showForm && (
                    <form onSubmit={handleSave} className="bg-teal-50 border border-teal-200 rounded-2xl p-5 space-y-4">
                      <h3 className="text-xs font-black text-teal-700 uppercase tracking-widest">New Nursing Assessment</h3>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Assessment Type</label>
                          <select value={form.assessment_type} onChange={e => setForm(f => ({ ...f, assessment_type: e.target.value }))}
                            className="w-full mt-1 text-xs border border-teal-200 rounded-lg px-2 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400">
                            {ASSESSMENT_TYPES.map(t => <option key={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Consciousness (AVPU)</label>
                          <select value={form.consciousness} onChange={e => setForm(f => ({ ...f, consciousness: e.target.value }))}
                            className="w-full mt-1 text-xs border border-teal-200 rounded-lg px-2 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400">
                            {CONSCIOUSNESS_OPTIONS.map(o => <option key={o}>{o}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Pain Score (0–10)</label>
                          <input type="number" min={0} max={10} value={form.pain_score}
                            onChange={e => setForm(f => ({ ...f, pain_score: Number(e.target.value) }))}
                            className="w-full mt-1 text-xs border border-teal-200 rounded-lg px-2 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Mobility</label>
                          <select value={form.mobility} onChange={e => setForm(f => ({ ...f, mobility: e.target.value }))}
                            className="w-full mt-1 text-xs border border-teal-200 rounded-lg px-2 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400">
                            {MOBILITY_OPTIONS.map(o => <option key={o}>{o}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase">
                            Fall Risk (Morse) — {form.fall_risk_score} — {fallRiskLabel(form.fall_risk_score)}
                          </label>
                          <input type="range" min={0} max={125} step={5} value={form.fall_risk_score}
                            onChange={e => setForm(f => ({ ...f, fall_risk_score: Number(e.target.value) }))}
                            className="w-full mt-1 accent-teal-600" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase">
                            Braden Score — {form.braden_score} — {bradenLabel(form.braden_score)}
                          </label>
                          <input type="range" min={6} max={23} step={1} value={form.braden_score}
                            onChange={e => setForm(f => ({ ...f, braden_score: Number(e.target.value) }))}
                            className="w-full mt-1 accent-teal-600" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Continence</label>
                          <select value={form.continence} onChange={e => setForm(f => ({ ...f, continence: e.target.value }))}
                            className="w-full mt-1 text-xs border border-teal-200 rounded-lg px-2 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400">
                            {CONTINENCE_OPTIONS.map(o => <option key={o}>{o}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Nutrition Screen (MUST)</label>
                          <input type="text" placeholder="Score or notes" value={form.nutrition_screen}
                            onChange={e => setForm(f => ({ ...f, nutrition_screen: e.target.value }))}
                            className="w-full mt-1 text-xs border border-teal-200 rounded-lg px-2 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400" />
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase">Additional Notes / Care Plan</label>
                        <textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                          placeholder="Document care plan items, skin assessment findings, safety measures…"
                          className="w-full mt-1 text-xs border border-teal-200 rounded-lg p-2.5 resize-none bg-white focus:outline-none focus:ring-2 focus:ring-teal-400" />
                      </div>

                      <button type="submit" disabled={saving}
                        className="w-full py-2.5 bg-teal-600 text-white text-xs font-black rounded-xl hover:bg-teal-700 disabled:opacity-50">
                        {saving ? 'Saving…' : 'Save Assessment'}
                      </button>
                    </form>
                  )}

                  {/* Assessment history */}
                  <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                    <div className="px-4 py-3 border-b bg-gray-50/50">
                      <p className="text-xs font-bold text-gray-700">Assessment History ({assessments.length})</p>
                    </div>
                    {assessments.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-8">No assessments recorded yet</p>
                    ) : (
                      <div className="divide-y">
                        {assessments.map((a: any) => (
                          <div key={a.id} className="px-5 py-4">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-teal-100 text-teal-700 rounded-full">{a.assessment_type}</span>
                                <span className="text-[10px] text-gray-400">{new Date(a.created_at).toLocaleString('en-IN')}</span>
                              </div>
                              {a.fall_risk_score >= 51 && (
                                <span className="flex items-center gap-1 text-[10px] font-black text-red-600">
                                  <AlertTriangle className="h-3 w-3" /> High Fall Risk
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-4 gap-2 text-[10px]">
                              {[
                                { label: 'Consciousness', value: a.consciousness },
                                { label: 'Pain', value: `${a.pain_score}/10` },
                                { label: 'Mobility', value: a.mobility },
                                { label: 'Continence', value: a.continence },
                                { label: 'Fall Risk', value: `${a.fall_risk_score} — ${fallRiskLabel(a.fall_risk_score)}` },
                                { label: 'Braden', value: `${a.braden_score} — ${bradenLabel(a.braden_score)}` },
                                { label: 'Nutrition', value: a.nutrition_screen || '—' },
                              ].map(item => (
                                <div key={item.label} className="bg-gray-50 rounded-lg p-2">
                                  <p className="text-gray-400 font-medium">{item.label}</p>
                                  <p className="font-bold text-gray-800 mt-0.5">{item.value}</p>
                                </div>
                              ))}
                            </div>
                            {a.notes && <p className="mt-2 text-xs text-gray-600 italic border-t pt-2">{a.notes}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
