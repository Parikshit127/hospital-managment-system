import { getTenantPrisma } from '@/backend/db';
import { redirect } from 'next/navigation';
import { FlaskConical, Clock, CheckCircle2, AlertCircle, Download } from 'lucide-react';
import { getPatientSession } from '../login/actions';

export default async function PatientLabsPage() {
    const session = await getPatientSession();
    if (!session) redirect('/patient/login');

    const db = getTenantPrisma(session.organization_id);

    const labOrders = await db.lab_orders.findMany({
        where: { patient_id: session.id },
        orderBy: { created_at: 'desc' },
    });

    const completed = labOrders.filter((l: any) => l.status === 'Completed');
    const pending = labOrders.filter((l: any) => l.status !== 'Completed');

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
            <div>
                <h2 className="text-2xl font-bold text-gray-900">Lab Results</h2>
                <p className="text-sm text-gray-500 mt-1">
                    {completed.length} completed, {pending.length} pending
                </p>
            </div>

            {/* Pending Tests */}
            {pending.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
                    <h3 className="font-bold text-amber-800 mb-4 flex items-center gap-2">
                        <Clock className="h-5 w-5" /> Pending Tests
                    </h3>
                    <div className="space-y-3">
                        {pending.map((lab: any) => (
                            <div key={lab.id} className="flex items-center justify-between bg-white rounded-xl p-4 border border-amber-100">
                                <div>
                                    <p className="font-semibold text-gray-900 text-sm">{lab.test_type}</p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Ordered: {new Date(lab.created_at).toLocaleDateString()}
                                        {lab.barcode && <span className="ml-2 font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">#{lab.barcode}</span>}
                                    </p>
                                </div>
                                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide bg-amber-100 text-amber-700">
                                    {lab.status}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Completed Tests */}
            <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
                <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
                    <FlaskConical className="h-5 w-5 text-purple-500" /> All Lab Results
                </h3>
                {labOrders.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                        <FlaskConical className="h-10 w-10 mx-auto mb-3 text-gray-200" />
                        <p className="text-sm">No lab tests ordered yet.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-500 uppercase bg-gray-50 rounded-xl">
                                <tr>
                                    <th className="px-4 py-3">Test Name</th>
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3">Barcode</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3 text-right">Result</th>
                                    <th className="px-4 py-3 text-right">Report</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {labOrders.map((lab: any) => (
                                    <tr key={lab.id} className="hover:bg-gray-50/50 transition">
                                        <td className="px-4 py-4 font-semibold text-gray-900">{lab.test_type}</td>
                                        <td className="px-4 py-4 text-gray-500">{new Date(lab.created_at).toLocaleDateString()}</td>
                                        <td className="px-4 py-4">
                                            {lab.barcode ? (
                                                <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{lab.barcode}</span>
                                            ) : '-'}
                                        </td>
                                        <td className="px-4 py-4">
                                            <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide ${
                                                lab.status === 'Completed' ? 'bg-green-100 text-green-700' :
                                                'bg-amber-100 text-amber-700'
                                            }`}>
                                                {lab.status === 'Completed' ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                                                {lab.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 text-right">
                                            {lab.result_value ? (
                                                <span className="font-mono text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded border border-emerald-100">
                                                    {lab.result_value}
                                                </span>
                                            ) : (
                                                <span className="text-gray-300 text-xs italic">Awaiting</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-4 text-right">
                                            {lab.status === 'Completed' && lab.barcode ? (
                                                <a
                                                    href={`/api/reports/lab/pdf?barcode=${lab.barcode}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition"
                                                >
                                                    <Download className="h-3.5 w-3.5" /> Report
                                                </a>
                                            ) : null}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
