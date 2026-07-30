'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User, Mic, LayoutDashboard, ArrowLeft } from 'lucide-react';

export default function ChooseBookingMethodPage() {
    const router = useRouter();

    // patientId / organisationId are resolved server-side from the session by
    // the voice page. There's no language param — the assistant auto-detects
    // English vs. Hindi from what the patient says.
    const startVoiceBooking = () => {
        router.push('/patient/appointment/voice');
    };

    return (
        <div className="min-h-screen bg-[#fafaf8] py-6 sm:py-10 px-4">
            <div className="max-w-2xl mx-auto">
                <Link href="/patient/dashboard" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4 sm:mb-6">
                    <ArrowLeft className="w-4 h-4" /> Back to Dashboard
                </Link>

                <div className="bg-white rounded-3xl shadow-[var(--shadow-lg)] border border-gray-200/60 overflow-hidden mb-6">
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 sm:px-8 py-6 sm:py-8 text-white text-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 translate-x-8 -translate-y-8 w-32 h-32 bg-blue-500 rounded-full opacity-30 blur-2xl"></div>
                        <div className="absolute bottom-0 left-0 -translate-x-6 translate-y-6 w-24 h-24 bg-indigo-500 rounded-full opacity-20 blur-2xl"></div>
                        <div className="relative z-10">
                            <h1 className="text-2xl font-black">Would you like to book an appointment now?</h1>
                            <p className="text-blue-100 text-sm mt-1">Choose how you would like to continue</p>
                        </div>
                    </div>

                    <div className="p-6 sm:p-8 space-y-4">
                        <button
                            onClick={startVoiceBooking}
                            className="w-full py-5 px-6 border-2 border-gray-200 rounded-2xl hover:border-indigo-400 hover:bg-indigo-50/50 transition-all flex items-center gap-4 group text-left"
                        >
                            <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                                <Mic className="w-6 h-6 text-indigo-600" />
                            </div>
                            <div>
                                <span className="font-bold text-gray-800 group-hover:text-indigo-700 text-lg block">Yes, use AI Voice Booking</span>
                                <p className="text-sm text-gray-500">Just speak your symptoms in English or Hindi — the assistant books it for you</p>
                            </div>
                        </button>

                        <button
                            onClick={() => router.push('/patient/appointments/book')}
                            className="w-full py-5 px-6 border-2 border-gray-200 rounded-2xl hover:border-blue-400 hover:bg-blue-50/50 transition-all flex items-center gap-4 group text-left"
                        >
                            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                                <User className="w-6 h-6 text-blue-600" />
                            </div>
                            <div>
                                <span className="font-bold text-gray-800 group-hover:text-blue-700 text-lg block">Yes, book manually</span>
                                <p className="text-sm text-gray-500">Select a doctor, date, and time yourself</p>
                            </div>
                        </button>

                        <button
                            onClick={() => router.push('/patient/dashboard')}
                            className="w-full py-5 px-6 border-2 border-gray-200 rounded-2xl hover:border-gray-400 hover:bg-gray-50 transition-all flex items-center gap-4 group text-left"
                        >
                            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
                                <LayoutDashboard className="w-6 h-6 text-gray-600" />
                            </div>
                            <div>
                                <span className="font-bold text-gray-800 group-hover:text-gray-900 text-lg block">No, take me to dashboard</span>
                                <p className="text-sm text-gray-500">You can always book an appointment later</p>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
