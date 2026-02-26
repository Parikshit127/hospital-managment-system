import { getTenantPrisma } from '@/backend/db';
import { redirect } from 'next/navigation';
import { CreditCard, Receipt, IndianRupee, Clock, CheckCircle2 } from 'lucide-react';
import { getPatientSession } from '../login/actions';
import PayButton from './PayButton';

export default async function PatientPaymentsPage() {
    const session = await getPatientSession();
    if (!session) redirect('/patient/login');

    const db = getTenantPrisma(session.organization_id);

    const invoices = await db.invoices.findMany({
        where: { patient_id: session.id },
        orderBy: { created_at: 'desc' },
    });

    const totalDue = invoices
        .filter((i: any) => i.status === 'Pending' || i.status === 'Partially Paid')
        .reduce((sum: any, i: any) => sum + (i.total_amount - i.paid_amount), 0);

    const totalPaid = invoices
        .filter((i: any) => i.status === 'Paid')
        .reduce((sum: any, i: any) => sum + i.total_amount, 0);

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
            <div>
                <h2 className="text-2xl font-bold text-gray-900">Payments</h2>
                <p className="text-sm text-gray-500 mt-1">View and pay your hospital invoices</p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-red-50 rounded-xl">
                            <IndianRupee className="h-5 w-5 text-red-500" />
                        </div>
                        <span className="text-sm font-medium text-gray-500">Amount Due</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{'\u20B9'}{totalDue.toLocaleString()}</p>
                </div>
                <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-green-50 rounded-xl">
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                        </div>
                        <span className="text-sm font-medium text-gray-500">Total Paid</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{'\u20B9'}{totalPaid.toLocaleString()}</p>
                </div>
                <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-blue-50 rounded-xl">
                            <Receipt className="h-5 w-5 text-blue-500" />
                        </div>
                        <span className="text-sm font-medium text-gray-500">Total Invoices</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{invoices.length}</p>
                </div>
            </div>

            {/* Invoice List */}
            <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
                <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-amber-500" /> Your Invoices
                </h3>

                {invoices.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                        <Receipt className="h-10 w-10 mx-auto mb-3 text-gray-200" />
                        <p className="text-sm">No invoices found.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {invoices.map((inv: any) => {
                            const remaining = inv.total_amount - inv.paid_amount;
                            const isPaid = inv.status === 'Paid';
                            return (
                                <div key={inv.invoice_id} className="border border-gray-100 rounded-2xl p-5 hover:bg-gray-50/50 transition">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                        <div>
                                            <div className="flex items-center gap-3 mb-1">
                                                <p className="font-bold text-gray-900">{inv.invoice_id}</p>
                                                <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide ${
                                                    isPaid ? 'bg-green-100 text-green-700' :
                                                    inv.status === 'Partially Paid' ? 'bg-blue-100 text-blue-700' :
                                                    'bg-amber-100 text-amber-700'
                                                }`}>{inv.status}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                                                <span className="flex items-center gap-1">
                                                    <Clock className="h-3 w-3" />
                                                    {new Date(inv.created_at).toLocaleDateString()}
                                                </span>
                                                <span>Total: {'\u20B9'}{inv.total_amount.toLocaleString()}</span>
                                                {inv.paid_amount > 0 && (
                                                    <span className="text-green-600">Paid: {'\u20B9'}{inv.paid_amount.toLocaleString()}</span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            {!isPaid && (
                                                <>
                                                    <span className="text-lg font-bold text-gray-900">
                                                        {'\u20B9'}{remaining.toLocaleString()}
                                                    </span>
                                                    <PayButton invoiceId={inv.invoice_id} amount={remaining} />
                                                </>
                                            )}
                                            {isPaid && (
                                                <span className="flex items-center gap-1.5 text-green-600 text-sm font-semibold">
                                                    <CheckCircle2 className="h-4 w-4" /> Paid
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
