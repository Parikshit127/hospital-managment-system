'use client';

import React, { useState, useRef, useEffect } from 'react';
import { KeyRound, Phone, ShieldCheck, Lock, ArrowLeft, ArrowRight, CheckCircle2, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { requestPasswordResetOTP, verifyPasswordResetOTP, resetPatientPassword } from './actions';

type Step = 'identify' | 'otp' | 'password' | 'success';

export default function ForgotPasswordPage() {
    const [step, setStep] = useState<Step>('identify');
    const [patientId, setPatientId] = useState('');
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [organizationId, setOrganizationId] = useState('');
    const [otpId, setOtpId] = useState<number | null>(null);
    const [resendTimer, setResendTimer] = useState(0);

    const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

    // Resend timer countdown
    useEffect(() => {
        if (resendTimer <= 0) return;
        const timer = setInterval(() => setResendTimer(v => v - 1), 1000);
        return () => clearInterval(timer);
    }, [resendTimer]);

    const handleRequestOTP = async () => {
        setError('');
        setLoading(true);
        try {
            const res = await requestPasswordResetOTP(patientId.trim(), phone.trim());
            if (res.success) {
                setOrganizationId(res.organizationId!);
                setStep('otp');
                setResendTimer(60);
                setTimeout(() => otpRefs.current[0]?.focus(), 100);
            } else {
                setError(res.error || 'Failed to send OTP.');
            }
        } catch {
            setError('Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleOtpChange = (index: number, value: string) => {
        if (!/^\d*$/.test(value)) return;
        const newOtp = [...otp];
        newOtp[index] = value.slice(-1);
        setOtp(newOtp);

        if (value && index < 5) {
            otpRefs.current[index + 1]?.focus();
        }
    };

    const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !otp[index] && index > 0) {
            otpRefs.current[index - 1]?.focus();
        }
    };

    const handleOtpPaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        const newOtp = [...otp];
        for (let i = 0; i < pasted.length; i++) {
            newOtp[i] = pasted[i];
        }
        setOtp(newOtp);
        const nextEmpty = pasted.length < 6 ? pasted.length : 5;
        otpRefs.current[nextEmpty]?.focus();
    };

    const handleVerifyOTP = async () => {
        const otpString = otp.join('');
        if (otpString.length !== 6) {
            setError('Please enter the complete 6-digit OTP.');
            return;
        }
        setError('');
        setLoading(true);
        try {
            const res = await verifyPasswordResetOTP(patientId, otpString, organizationId);
            if (res.success) {
                setOtpId(res.otpId!);
                setStep('password');
            } else {
                setError(res.error || 'Invalid OTP.');
            }
        } catch {
            setError('Verification failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleResendOTP = async () => {
        if (resendTimer > 0) return;
        setError('');
        setLoading(true);
        try {
            const res = await requestPasswordResetOTP(patientId, phone);
            if (res.success) {
                setResendTimer(60);
                setOtp(['', '', '', '', '', '']);
                otpRefs.current[0]?.focus();
            } else {
                setError(res.error || 'Failed to resend OTP.');
            }
        } catch {
            setError('Failed to resend OTP.');
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async () => {
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,64}$/.test(password)) {
            setError('Password must be 8–64 characters with uppercase, lowercase, number, and special character.');
            return;
        }
        setError('');
        setLoading(true);
        try {
            const res = await resetPatientPassword(patientId, otpId!, password, organizationId);
            if (res.success) {
                setStep('success');
            } else {
                setError(res.error || 'Failed to reset password.');
            }
        } catch {
            setError('Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Password strength checks
    const passwordChecks = [
        { label: 'At least 8 characters', met: password.length >= 8 },
        { label: 'Uppercase letter', met: /[A-Z]/.test(password) },
        { label: 'Lowercase letter', met: /[a-z]/.test(password) },
        { label: 'Number', met: /\d/.test(password) },
        { label: 'Special character', met: /[^A-Za-z\d]/.test(password) },
    ];

    const stepConfig = {
        identify: { title: 'Forgot Password', subtitle: 'Enter your Patient ID and registered phone number', icon: KeyRound },
        otp: { title: 'Verify OTP', subtitle: `Enter the 6-digit code sent to ****${phone.slice(-4)}`, icon: ShieldCheck },
        password: { title: 'New Password', subtitle: 'Create a strong password for your account', icon: Lock },
        success: { title: 'Password Reset', subtitle: 'Your password has been successfully reset', icon: CheckCircle2 },
    };

    const { title, subtitle, icon: StepIcon } = stepConfig[step];

    return (
        <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Back link */}
                <Link
                    href="/patient/login"
                    className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-emerald-600 mb-6 transition"
                >
                    <ArrowLeft className="h-4 w-4" /> Back to Login
                </Link>

                <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
                    {/* Step indicator */}
                    <div className="flex border-b border-gray-100">
                        {['identify', 'otp', 'password'].map((s, i) => (
                            <div
                                key={s}
                                className={`flex-1 h-1.5 transition-all ${
                                    ['identify', 'otp', 'password', 'success'].indexOf(step) >= i
                                        ? 'bg-emerald-500'
                                        : 'bg-gray-100'
                                }`}
                            />
                        ))}
                    </div>

                    <div className="p-8">
                        {/* Header */}
                        <div className="text-center mb-8">
                            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 ${
                                step === 'success'
                                    ? 'bg-emerald-100 text-emerald-600'
                                    : 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20'
                            }`}>
                                <StepIcon className="h-7 w-7" />
                            </div>
                            <h2 className="text-xl font-black text-gray-900">{title}</h2>
                            <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
                                <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                                <p className="text-sm text-red-700">{error}</p>
                            </div>
                        )}

                        {/* Step 1: Identify */}
                        {step === 'identify' && (
                            <div className="space-y-5">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-2">Patient ID</label>
                                    <input
                                        type="text"
                                        value={patientId}
                                        onChange={e => setPatientId(e.target.value)}
                                        placeholder="e.g. UHID-2024-00001"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-2">Registered Phone</label>
                                    <div className="flex">
                                        <span className="flex items-center px-3 bg-gray-100 border border-r-0 border-gray-200 rounded-l-xl text-sm text-gray-500 font-medium">
                                            +91
                                        </span>
                                        <input
                                            type="tel"
                                            value={phone}
                                            onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                            placeholder="10-digit phone number"
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-r-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition"
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={handleRequestOTP}
                                    disabled={loading || !patientId.trim() || phone.length < 10}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 text-white font-bold rounded-xl transition"
                                >
                                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
                                    {loading ? 'Sending OTP...' : 'Send OTP'}
                                </button>
                            </div>
                        )}

                        {/* Step 2: OTP Verification */}
                        {step === 'otp' && (
                            <div className="space-y-6">
                                <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
                                    {otp.map((digit, i) => (
                                        <input
                                            key={i}
                                            ref={el => { otpRefs.current[i] = el; }}
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={1}
                                            value={digit}
                                            onChange={e => handleOtpChange(i, e.target.value)}
                                            onKeyDown={e => handleOtpKeyDown(i, e)}
                                            className={`w-12 h-14 text-center text-xl font-black rounded-xl border-2 transition-all focus:outline-none ${
                                                digit
                                                    ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                                                    : 'border-gray-200 bg-gray-50 text-gray-900 focus:border-emerald-400'
                                            }`}
                                        />
                                    ))}
                                </div>

                                <button
                                    onClick={handleVerifyOTP}
                                    disabled={loading || otp.join('').length !== 6}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 text-white font-bold rounded-xl transition"
                                >
                                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                                    {loading ? 'Verifying...' : 'Verify OTP'}
                                </button>

                                <div className="text-center">
                                    <button
                                        onClick={handleResendOTP}
                                        disabled={resendTimer > 0 || loading}
                                        className="text-sm font-medium text-emerald-600 hover:text-emerald-700 disabled:text-gray-400 transition"
                                    >
                                        {resendTimer > 0 ? `Resend OTP in ${resendTimer}s` : 'Resend OTP'}
                                    </button>
                                </div>

                                <button
                                    onClick={() => { setStep('identify'); setError(''); setOtp(['', '', '', '', '', '']); }}
                                    className="w-full text-sm text-gray-500 hover:text-gray-700 font-medium text-center transition"
                                >
                                    Change Patient ID / Phone
                                </button>
                            </div>
                        )}

                        {/* Step 3: New Password */}
                        {step === 'password' && (
                            <div className="space-y-5">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-2">New Password</label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            placeholder="Enter new password"
                                            className="w-full px-4 py-3 pr-12 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                        >
                                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-2">Confirm Password</label>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={confirmPassword}
                                        onChange={e => setConfirmPassword(e.target.value)}
                                        placeholder="Confirm new password"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition"
                                    />
                                    {confirmPassword && password !== confirmPassword && (
                                        <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
                                    )}
                                </div>

                                {/* Password strength */}
                                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Password Requirements</p>
                                    {passwordChecks.map((check, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <div className={`h-1.5 w-1.5 rounded-full ${check.met ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                                            <span className={`text-xs ${check.met ? 'text-emerald-700 font-medium' : 'text-gray-400'}`}>
                                                {check.label}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                <button
                                    onClick={handleResetPassword}
                                    disabled={loading || !passwordChecks.every(c => c.met) || password !== confirmPassword}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 text-white font-bold rounded-xl transition"
                                >
                                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                                    {loading ? 'Resetting Password...' : 'Reset Password'}
                                </button>
                            </div>
                        )}

                        {/* Step 4: Success */}
                        {step === 'success' && (
                            <div className="text-center space-y-6">
                                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-100">
                                    <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                                </div>
                                <p className="text-sm text-gray-600">
                                    Your password has been reset successfully. You can now log in with your new password.
                                </p>
                                <Link
                                    href="/patient/login"
                                    className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition w-full"
                                >
                                    <ArrowRight className="h-4 w-4" /> Go to Login
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
