import { getTenantPrisma } from '@/backend/db';
import { redirect } from 'next/navigation';
import {
    Calendar, FileText, FlaskConical, Stethoscope, Clock, ActivitySquare,
    ArrowRight, CreditCard, Heart
} from 'lucide-react';
import { getPatientSession } from '../login/actions';
import Link from 'next/link';

export default async function PatientDashboard() {
    const session = await getPatientSession();
    if (!session) redirect('/patient/login');

    const db = getTenantPrisma(session.organization_id);

    const [patientDetails, medicalHistory, labOrders, invoices] = await Promise.all([
        db.oPD_REG.findUnique({
            where: { patient_id: session.id },
            include: {
                appointments: { orderBy: { appointment_date: 'desc' }, take: 3 },
                admissions: {
                    include: { ward: true, bed: true },
                    orderBy: { admission_date: 'desc' },
                    take: 1,
                },
            },
        }),
        db.clinical_EHR.findMany({
            where: { patient_id: session.id },
            orderBy: { created_at: 'desc' },
            take: 3,
        }),
        db.lab_orders.findMany({
            where: { patient_id: session.id },
            orderBy: { created_at: 'desc' },
            take: 5,
        }),
        db.invoices.findMany({
            where: { patient_id: session.id },
            orderBy: { created_at: 'desc' },
            take: 3,
        }),
    ]);

    const pendingInvoices = invoices.filter((i: any) => i.status === 'Pending' || i.status === 'Partially Paid');
    const pendingLabs = labOrders.filter((l: any) => l.status !== 'Completed');

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
            {/* Hero */}
            <div className="bg-emerald-500 rounded-3xl p-8 sm:p-10 text-white relative overflow-hidden shadow-lg shadow-emerald-500/10">
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-400 rounded-full opacity-50 blur-3xl translate-x-1/2 -translate-y-1/2" />
                <div className="relative z-10">
                    <h2 className="text-3xl font-bold tracking-tight">Welcome back, {session.name}</h2>
                    <p className="text-emerald-50 mt-2 text-sm sm:text-base max-w-xl">
                        View your upcoming appointments, recent lab results, and manage your health records.
                    </p>
                </div>
            </div>

            {/* Quick Action Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Link href="/patient/appointments" className="bg-white border border-gray-100 rounded-2xl p-5 hover:border-emerald-200 hover:shadow-md transition group">
                    <Calendar className="h-6 w-6 text-indigo-500 mb-3" />
                    <p className="text-sm font-bold text-gray-900">Book Appointment</p>
                    <p className="text-xs text-gray-400 mt-1">Schedule a visit</p>
                </Link>
                <Link href="/patient/labs" className="bg-white border border-gray-100 rounded-2xl p-5 hover:border-emerald-200 hover:shadow-md transition group">
                    <FlaskConical className="h-6 w-6 text-purple-500 mb-3" />
                    <p className="text-sm font-bold text-gray-900">Lab Results</p>
                    <p className="text-xs text-gray-400 mt-1">{pendingLabs.length} pending</p>
                </Link>
                <Link href="/patient/payments" className="bg-white border border-gray-100 rounded-2xl p-5 hover:border-emerald-200 hover:shadow-md transition group">
                    <CreditCard className="h-6 w-6 text-amber-500 mb-3" />
                    <p className="text-sm font-bold text-gray-900">Payments</p>
                    <p className="text-xs text-gray-400 mt-1">{pendingInvoices.length} due</p>
                </Link>
                <div className="bg-white border border-gray-100 rounded-2xl p-5">
                    <Heart className="h-6 w-6 text-rose-500 mb-3" />
                    <p className="text-sm font-bold text-gray-900">Health Score</p>
                    <p className="text-xs text-gray-400 mt-1">Coming soon</p>
                </div>
            </div>

            {/* Active Admission Banner */}
            {patientDetails?.admissions[0]?.status === 'Admitted' && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 shadow-sm">
                    <div className="flex gap-3 items-center mb-4 text-amber-700 font-bold">
                        <ActivitySquare className="h-5 w-5" />
                        <h3>Currently Admitted</h3>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                            <span className="text-amber-700/70 text-xs block">Ward</span>
                            <span className="font-semibold text-amber-900">{patientDetails.admissions[0].ward?.ward_name || '-'}</span>
                        </div>
                        <div>
                            <span className="text-amber-700/70 text-xs block">Bed</span>
                            <span className="font-semibold text-amber-900">{patientDetails.admissions[0].bed?.bed_id || '-'}</span>
                        </div>
                        <div>
                            <span className="text-amber-700/70 text-xs block">Doctor</span>
                            <span className="font-semibold text-amber-900">Dr. {patientDetails.admissions[0].doctor_name || '-'}</span>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Appointments */}
                <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-indigo-50 text-indigo-500 rounded-xl">
                                <Calendar className="w-5 h-5" />
                            </div>
                            <h3 className="font-bold text-gray-900">Appointments</h3>
                        </div>
                        <Link href="/patient/appointments" className="text-xs text-emerald-500 font-semibold flex items-center gap-1 hover:text-emerald-600">
                            View all <ArrowRight className="h-3 w-3" />
                        </Link>
                    </div>
                    {!patientDetails?.appointments.length ? (
                        <p className="text-gray-400 text-sm italic">No appointments yet.</p>
                    ) : (
                        <div className="space-y-3">
                            {patientDetails.appointments.map((appt: any) => (
                                <div key={appt.appointment_id} className="p-4 rounded-2xl border border-gray-100 bg-gray-50/50">
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="font-semibold text-gray-900 text-sm">Dr. {appt.doctor_name || 'Unassigned'}</span>
                                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide ${
                                            appt.status === 'Completed' ? 'bg-green-100 text-green-700' :
                                            appt.status === 'Pending' || appt.status === 'Scheduled' ? 'bg-amber-100 text-amber-700' :
                                            'bg-blue-100 text-blue-700'
                                        }`}>{appt.status}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-2">
                                        <Clock className="w-3.5 h-3.5" />
                                        {new Date(appt.appointment_date).toLocaleDateString()}
                                        <span className="mx-1">&middot;</span>
                                        {appt.department || 'General'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Clinical Summaries */}
                <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm lg:col-span-2">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2.5 bg-blue-50 text-blue-500 rounded-xl">
                            <Stethoscope className="w-5 h-5" />
                        </div>
                        <h3 className="font-bold text-gray-900">Recent Clinical Summaries</h3>
                    </div>
                    {medicalHistory.length === 0 ? (
                        <div className="text-center py-10 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                            <FileText className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                            <p className="text-gray-500 text-sm">No clinical summaries available yet.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {medicalHistory.map((record: any) => (
                                <div key={record.appointment_id} className="border border-gray-100 rounded-2xl p-5">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <h4 className="font-bold text-gray-900 mb-1">{record.diagnosis || 'General Consultation'}</h4>
                                            <p className="text-xs text-gray-500">Dr. {record.doctor_name} &middot; {new Date(record.created_at).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    <p className="text-sm text-gray-600 line-clamp-3">{record.doctor_notes || 'No detailed notes.'}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Lab Results Summary */}
            <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-purple-50 text-purple-500 rounded-xl">
                            <FlaskConical className="w-5 h-5" />
                        </div>
                        <h3 className="font-bold text-gray-900">Recent Lab Tests</h3>
                    </div>
                    <Link href="/patient/labs" className="text-xs text-emerald-500 font-semibold flex items-center gap-1 hover:text-emerald-600">
                        View all <ArrowRight className="h-3 w-3" />
                    </Link>
                </div>
                {labOrders.length === 0 ? (
                    <p className="text-gray-400 text-sm italic">No lab tests ordered.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-500 uppercase bg-gray-50/50">
                                <tr>
                                    <th className="px-4 py-3 rounded-l-lg">Test Name</th>
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3 rounded-r-lg text-right">Result</th>
                                </tr>
                            </thead>
                            <tbody>
                                {labOrders.map((lab: any) => (
                                    <tr key={lab.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                                        <td className="px-4 py-4 font-semibold text-gray-900">{lab.test_type}</td>
                                        <td className="px-4 py-4 text-gray-500">{new Date(lab.created_at).toLocaleDateString()}</td>
                                        <td className="px-4 py-4">
                                            <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide ${
                                                lab.status === 'Completed' ? 'bg-green-100 text-green-700' :
                                                lab.status === 'Pending' ? 'bg-amber-100 text-amber-700' :
                                                'bg-gray-100 text-gray-700'
                                            }`}>{lab.status}</span>
                                        </td>
                                        <td className="px-4 py-4 text-right">
                                            {lab.result_value ? (
                                                <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded text-gray-700">{lab.result_value}</span>
                                            ) : (
                                                <span className="text-gray-400 italic text-xs">Awaiting</span>
                                            )}
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
