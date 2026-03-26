'use client';

import React, { useState } from 'react';
import {
  Bed,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Stethoscope,
  ArrowRightLeft,
  UtensilsCrossed,
  CheckCircle2,
  FileText,
  AlertTriangle,
  Users,
} from 'lucide-react';

interface IPDJourneyTabProps {
  admissions: any[];
}

const fmtDate = (v?: string | Date | null) => {
  if (!v) return 'N/A';
  return new Date(v).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export default function IPDJourneyTab({ admissions }: IPDJourneyTabProps) {
  const [expandedAdmissions, setExpandedAdmissions] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    admissions.forEach((a: any) => {
      if ((a.status || '').toLowerCase() === 'admitted') {
        initial.add(a.admission_id || a.id || String(Math.random()));
      }
    });
    return initial;
  });

  const toggleAdmission = (id: string) => {
    setExpandedAdmissions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (admissions.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
        <Bed className="h-8 w-8 text-gray-300 mx-auto mb-2" />
        <p className="text-gray-400 text-sm font-medium">No IPD admissions found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {admissions.map((admission: any, aIdx: number) => {
        const aId = admission.admission_id || admission.id || String(aIdx);
        const isExpanded = expandedAdmissions.has(aId);
        const statusNorm = (admission.status || '').toLowerCase();
        const statusCls =
          statusNorm === 'admitted'
            ? 'bg-rose-50 text-rose-700 border-rose-200'
            : 'bg-emerald-50 text-emerald-700 border-emerald-200';

        const medicalNotes: any[] = admission.medical_notes || admission.medicalNotes || [];
        const wardRounds: any[] = admission.ward_rounds || admission.wardRounds || [];
        const nursingTasks: any[] = admission.nursing_tasks || admission.nursingTasks || [];
        const dietPlans: any[] = admission.diet_plans || admission.dietPlans || [];
        const bedTransfers: any[] = admission.bed_transfers || admission.bedTransfers || [];
        const dischargeSummaries: any[] =
          admission.discharge_summaries || admission.dischargeSummaries || [];

        const hasCaseDetails =
          admission.case_fir_number ||
          admission.case_is_rta ||
          admission.case_is_substance_abuse ||
          admission.case_is_medico_legal ||
          admission.case_brought_by_police ||
          admission.case_notes;

        return (
          <div
            key={aId}
            className="bg-white border border-gray-200 rounded-2xl overflow-hidden"
          >
            {/* HEADER - always visible */}
            <button
              onClick={() => toggleAdmission(aId)}
              className="w-full text-left p-5 hover:bg-gray-50/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-bold text-gray-800">
                    {admission.admission_id || 'N/A'}
                  </span>
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusCls}`}
                  >
                    {admission.status || 'Unknown'}
                  </span>
                  <span className="text-xs text-gray-500">
                    {admission.doctor?.full_name || admission.doctor_name || 'N/A'}
                  </span>
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-5 w-5 text-gray-400 shrink-0" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-gray-400 shrink-0" />
                )}
              </div>
              <p className="text-sm font-semibold text-gray-700 mb-2">
                {admission.diagnosis || 'No diagnosis recorded'}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                <span>
                  Admitted: {fmtDate(admission.admission_date)} —{' '}
                  {admission.discharge_date ? fmtDate(admission.discharge_date) : 'Ongoing'}
                </span>
                {admission.bed && (
                  <span>
                    Bed: {admission.bed.bed_id || 'N/A'} ({admission.bed.bed_category || 'N/A'})
                  </span>
                )}
                {admission.ward && <span>Ward: {admission.ward.ward_name || 'N/A'}</span>}
              </div>
            </button>

            {/* EXPANDED CONTENT */}
            {isExpanded && (
              <div className="border-t border-gray-200 p-5 space-y-6">
                {/* Medical Notes */}
                {medicalNotes.length > 0 && (
                  <div>
                    <h4 className="text-sm font-black text-gray-700 mb-3 flex items-center gap-2">
                      <ClipboardList className="h-4 w-4 text-teal-600" />
                      Medical Notes
                    </h4>
                    <div className="space-y-2">
                      {medicalNotes.map((note: any, nIdx: number) => {
                        const noteType = note.note_type || 'General';
                        return (
                          <div
                            key={nIdx}
                            className="bg-gray-50 border border-gray-200 rounded-xl p-3"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                {noteType}
                              </span>
                              <span className="text-[10px] text-gray-400 font-semibold">
                                {fmtDate(note.created_at || note.date)}
                              </span>
                            </div>
                            <p className="text-xs text-gray-700 mt-1 leading-relaxed">
                              {note.details || note.content || 'No details'}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Ward Rounds */}
                {wardRounds.length > 0 && (
                  <div>
                    <h4 className="text-sm font-black text-gray-700 mb-3 flex items-center gap-2">
                      <Stethoscope className="h-4 w-4 text-blue-600" />
                      Ward Rounds
                    </h4>
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200 bg-gray-50/80">
                              {['Date', 'Doctor', 'Observations', 'Plan Changes'].map((h) => (
                                <th
                                  key={h}
                                  className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide"
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {wardRounds.map((wr: any, wIdx: number) => (
                              <tr key={wIdx} className="hover:bg-gray-50">
                                <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                                  {fmtDate(wr.round_date || wr.created_at)}
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-700 font-semibold">
                                  {wr.doctor?.full_name || wr.doctor_name || 'N/A'}
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-600 max-w-[200px] truncate">
                                  {wr.observations || 'N/A'}
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-600 max-w-[200px] truncate">
                                  {wr.plan_changes || 'N/A'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* Nursing Tasks */}
                {nursingTasks.length > 0 && (
                  <div>
                    <h4 className="text-sm font-black text-gray-700 mb-3 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      Nursing Tasks
                    </h4>
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200 bg-gray-50/80">
                              {[
                                'Type',
                                'Description',
                                'Status',
                                'Scheduled',
                                'Completed',
                                'Assigned To',
                              ].map((h) => (
                                <th
                                  key={h}
                                  className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide"
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {nursingTasks.map((task: any, tIdx: number) => {
                              const taskStatus = (task.status || '').toLowerCase();
                              const taskStatusCls =
                                taskStatus === 'completed'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : taskStatus === 'pending'
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : taskStatus === 'overdue'
                                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                                      : 'bg-gray-100 text-gray-600 border-gray-200';

                              return (
                                <tr key={tIdx} className="hover:bg-gray-50">
                                  <td className="px-3 py-2">
                                    <span className="bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                      {task.task_type || task.type || 'General'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-xs text-gray-600 max-w-[200px] truncate">
                                    {task.description || 'N/A'}
                                  </td>
                                  <td className="px-3 py-2">
                                    <span
                                      className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${taskStatusCls}`}
                                    >
                                      {task.status || 'Unknown'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                                    {fmtDate(task.scheduled_time || task.scheduled_at)}
                                  </td>
                                  <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                                    {fmtDate(task.completed_time || task.completed_at)}
                                  </td>
                                  <td className="px-3 py-2 text-xs text-gray-700">
                                    {task.assigned_to?.full_name ||
                                      task.assigned_to_name ||
                                      'N/A'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* Diet Plans */}
                {dietPlans.length > 0 && (
                  <div>
                    <h4 className="text-sm font-black text-gray-700 mb-3 flex items-center gap-2">
                      <UtensilsCrossed className="h-4 w-4 text-amber-600" />
                      Diet Plans
                    </h4>
                    <div className="space-y-2">
                      {dietPlans.map((dp: any, dIdx: number) => {
                        const isActive = (dp.status || dp.is_active) === true || (dp.status || '').toLowerCase() === 'active';
                        return (
                          <div
                            key={dIdx}
                            className="bg-gray-50 border border-gray-200 rounded-xl p-3"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                {dp.diet_type || 'General'}
                              </span>
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  isActive
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-gray-100 text-gray-500 border-gray-200'
                                }`}
                              >
                                {isActive ? 'Active' : 'Inactive'}
                              </span>
                            </div>
                            <p className="text-xs text-gray-600 mt-1">
                              {dp.instructions || 'No instructions'}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Bed Transfers */}
                {bedTransfers.length > 0 && (
                  <div>
                    <h4 className="text-sm font-black text-gray-700 mb-3 flex items-center gap-2">
                      <ArrowRightLeft className="h-4 w-4 text-indigo-600" />
                      Bed Transfers
                    </h4>
                    <div className="space-y-2">
                      {bedTransfers.map((bt: any, bIdx: number) => (
                        <div
                          key={bIdx}
                          className="bg-gray-50 border border-gray-200 rounded-xl p-3"
                        >
                          <div className="flex items-center gap-2 text-sm mb-1">
                            <span className="font-semibold text-gray-700">
                              {bt.from_bed?.bed_id || bt.from_bed_id || 'N/A'}
                            </span>
                            <ArrowRightLeft className="h-3.5 w-3.5 text-gray-400" />
                            <span className="font-semibold text-gray-700">
                              {bt.to_bed?.bed_id || bt.to_bed_id || 'N/A'}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                            <span>Reason: {bt.reason || 'N/A'}</span>
                            <span>By: {bt.transferred_by?.full_name || bt.transferred_by_name || 'N/A'}</span>
                            <span>{fmtDate(bt.transfer_date || bt.created_at)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Discharge Summary */}
                {dischargeSummaries.length > 0 && (
                  <div>
                    <h4 className="text-sm font-black text-gray-700 mb-3 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-emerald-600" />
                      Discharge Summary
                    </h4>
                    {dischargeSummaries.map((ds: any, dsIdx: number) => (
                      <div
                        key={dsIdx}
                        className="bg-gray-50 border border-gray-200 rounded-xl p-4"
                      >
                        <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
                          {ds.generated_summary || 'No summary generated'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Case Details */}
                {hasCaseDetails && (
                  <div>
                    <h4 className="text-sm font-black text-gray-700 mb-3 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-rose-600" />
                      Case Details
                    </h4>
                    <div className="bg-rose-50/50 border border-rose-200 rounded-xl p-4 space-y-2">
                      {admission.case_fir_number && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-gray-500 font-semibold">FIR Number:</span>
                          <span className="text-gray-800 font-bold">
                            {admission.case_fir_number}
                          </span>
                        </div>
                      )}
                      {admission.case_is_rta != null && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-gray-500 font-semibold">Road Traffic Accident:</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              admission.case_is_rta
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-gray-100 text-gray-600 border-gray-200'
                            }`}
                          >
                            {admission.case_is_rta ? 'Yes' : 'No'}
                          </span>
                        </div>
                      )}
                      {admission.case_is_substance_abuse != null && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-gray-500 font-semibold">Substance Abuse:</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              admission.case_is_substance_abuse
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-gray-100 text-gray-600 border-gray-200'
                            }`}
                          >
                            {admission.case_is_substance_abuse ? 'Yes' : 'No'}
                          </span>
                        </div>
                      )}
                      {admission.case_is_medico_legal != null && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-gray-500 font-semibold">Medico Legal:</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              admission.case_is_medico_legal
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-gray-100 text-gray-600 border-gray-200'
                            }`}
                          >
                            {admission.case_is_medico_legal ? 'Yes' : 'No'}
                          </span>
                        </div>
                      )}
                      {admission.case_brought_by_police != null && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-gray-500 font-semibold">Brought by Police:</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              admission.case_brought_by_police
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-gray-100 text-gray-600 border-gray-200'
                            }`}
                          >
                            {admission.case_brought_by_police ? 'Yes' : 'No'}
                          </span>
                        </div>
                      )}
                      {admission.case_notes && (
                        <div className="text-xs">
                          <span className="text-gray-500 font-semibold">Case Notes:</span>
                          <p className="text-gray-700 mt-1 leading-relaxed">
                            {admission.case_notes}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
