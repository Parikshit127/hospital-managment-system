'use client';

import { useActionState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { login } from './actions';
import { useState, useEffect, Suspense } from 'react';

function LoginForm() {
    const [state, loginAction, isPending] = useActionState(login, { success: false, error: '' });
    const [showPassword, setShowPassword] = useState(false);
    const searchParams = useSearchParams();
    const isTimeout = searchParams.get('reason') === 'timeout';
    const router = useRouter();

    useEffect(() => {
        if (state?.success && (state as any).mfa_required) {
            router.push('/login/mfa');
        }
    }, [state, router]);

    return (
        <>
            <style>{`
                *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

                :root {
                    --g50:  #f0faf6;
                    --g100: #d4f0e3;
                    --g200: #a8e0c7;
                    --g400: #34c48a;
                    --g500: #1aab74;
                    --g600: #0f8f5e;
                    --sage: #8bada0;
                    --sage-light: #c8ddd7;
                    --white: #ffffff;
                    --off:  #f8fbf9;
                    --ink:  #0e2018;
                    --mid:  #3d6554;
                    --soft: #7a9d8e;
                    --border: #deeee8;
                    --shadow: rgba(15,143,94,0.12);
                }

                html, body { height: 100%; background: var(--off); }

                .page {
                    min-height: 100vh;
                    font-family: 'Outfit', sans-serif;
                    background: var(--off);
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    position: relative;
                    overflow: hidden;
                }

                /* ─── BACKGROUND ─── */
                .blob {
                    position: fixed;
                    border-radius: 50%;
                    filter: blur(90px);
                    pointer-events: none;
                    z-index: 0;
                }
                .b1 { width:700px;height:700px;background:radial-gradient(circle,#c6eedd,transparent 70%);top:-200px;left:-200px; }
                .b2 { width:500px;height:500px;background:radial-gradient(circle,#d4f0e3,transparent 70%);bottom:-100px;right:300px; }
                .b3 { width:300px;height:300px;background:radial-gradient(circle,#a8e0c740,transparent 70%);top:40%;right:100px; }

                .grid-bg {
                    position: fixed; inset: 0; z-index: 0; pointer-events: none;
                    opacity: .35;
                    background-image:
                        linear-gradient(var(--g100) 1px,transparent 1px),
                        linear-gradient(90deg,var(--g100) 1px,transparent 1px);
                    background-size: 60px 60px;
                    mask-image: radial-gradient(ellipse at 60% 50%, black 0%, transparent 65%);
                }

                /* ─── LEFT HERO ─── */
                .hero {
                    position: relative; z-index: 1;
                    display: flex; flex-direction: column; justify-content: space-between;
                    padding: 56px 64px 56px 72px;
                }

                .brand {
                    display: flex; align-items: center; gap: 12px;
                    animation: rise .7s ease both;
                }
                .brand-icon {
                    width:42px;height:42px;
                    background:var(--g500);border-radius:12px;
                    display:flex;align-items:center;justify-content:center;
                    box-shadow:0 4px 14px var(--shadow);
                }
                .brand-icon svg { color:#fff; }
                .brand-name { font-size:17px;font-weight:600;color:var(--ink);letter-spacing:-.01em; }
                .brand-name span { color:var(--g500); }

                .hero-body { animation: rise .7s .1s ease both; }

                .badge {
                    display:inline-flex;align-items:center;gap:7px;
                    background:var(--g100);border:1px solid var(--g200);
                    border-radius:100px;padding:6px 14px 6px 8px;margin-bottom:32px;
                }
                .badge-dot {
                    width:8px;height:8px;border-radius:50%;background:var(--g500);
                    animation:pulse-dot 2s ease infinite;
                }
                .badge-text { font-size:12px;font-weight:500;color:var(--g600);letter-spacing:.03em; }

                .hero-hl {
                    font-family:'Playfair Display',Georgia,serif;
                    font-weight:900;font-size:clamp(48px,5.5vw,72px);
                    line-height:1.0;color:var(--ink);letter-spacing:-.02em;margin-bottom:24px;
                }
                .hero-hl .accent { color:var(--g500);display:block; }

                .hero-desc {
                    font-size:16px;line-height:1.7;color:var(--mid);
                    font-weight:300;max-width:420px;margin-bottom:48px;
                }

                .stats { display:flex;gap:40px; }
                .stat { display:flex;flex-direction:column;gap:4px; }
                .stat-num {
                    font-family:'Playfair Display',serif;font-size:28px;
                    font-weight:800;color:var(--ink);letter-spacing:-.02em;
                }
                .stat-lbl { font-size:12px;color:var(--soft);font-weight:400;letter-spacing:.03em; }
                .stat-div { width:1px;background:var(--border);align-self:stretch; }

                .float-card {
                    background:var(--white);border:1px solid var(--border);
                    border-radius:16px;padding:18px 22px;
                    display:flex;align-items:center;gap:14px;
                    box-shadow:0 8px 32px var(--shadow);width:fit-content;
                    animation: float 4s ease-in-out infinite, rise .7s .25s ease both;
                }
                .card-icon {
                    width:40px;height:40px;background:var(--g50);border-radius:10px;
                    display:flex;align-items:center;justify-content:center;flex-shrink:0;
                }
                .card-icon svg { color:var(--g500); }
                .card-main { font-size:14px;font-weight:600;color:var(--ink); }
                .card-sub  { font-size:12px;color:var(--soft);margin-top:2px; }

                /* ─── RIGHT FORM ─── */
                .form-side {
                    position:relative;z-index:1;
                    display:flex;align-items:center;justify-content:center;
                    padding:56px 80px 56px 56px;
                }
                .form-side::before {
                    content:'';position:absolute;left:0;top:15%;bottom:15%;
                    width:1px;
                    background:linear-gradient(to bottom,transparent,var(--g200),transparent);
                }

                .form-wrap {
                    width:100%;max-width:420px;
                    animation: rise .7s .2s ease both;
                }

                .form-tag {
                    font-size:11px;font-weight:600;letter-spacing:.12em;
                    text-transform:uppercase;color:var(--g500);margin-bottom:12px;
                }
                .form-title {
                    font-family:'Playfair Display',Georgia,serif;
                    font-size:38px;font-weight:800;color:var(--ink);
                    letter-spacing:-.02em;line-height:1.1;margin-bottom:8px;
                }
                .form-sub { font-size:14px;color:var(--soft);font-weight:400;margin-bottom:36px; }

                /* Timeout notice */
                .timeout-box {
                    display:flex;align-items:center;gap:10px;
                    background:#fffbeb;border:1px solid #fde68a;
                    border-radius:12px;padding:12px 16px;margin-bottom:20px;
                    font-size:13px;color:#92400e;
                    animation:rise .3s ease both;
                }
                .timeout-box svg { flex-shrink:0;color:#d97706; }

                /* Error */
                .error-box {
                    display:flex;align-items:center;gap:10px;
                    background:#fff5f5;border:1px solid #fecaca;
                    border-radius:12px;padding:12px 16px;margin-bottom:20px;
                    font-size:13px;color:#dc2626;
                    animation:rise .3s ease both;
                }
                .err-icon {
                    width:22px;height:22px;background:#fee2e2;border-radius:50%;
                    display:flex;align-items:center;justify-content:center;
                    font-size:12px;font-weight:700;flex-shrink:0;color:#dc2626;
                }

                /* Fields */
                .fields { display:flex;flex-direction:column;gap:20px; }
                .field-lbl {
                    display:block;font-size:12px;font-weight:600;
                    letter-spacing:.06em;text-transform:uppercase;
                    color:var(--mid);margin-bottom:8px;
                }
                .input-wrap { position:relative; }
                .input-icon {
                    position:absolute;left:16px;top:50%;transform:translateY(-50%);
                    color:var(--sage-light);display:flex;align-items:center;
                    transition:color .2s;pointer-events:none;
                }
                .input-wrap:focus-within .input-icon { color:var(--g500); }

                .eye-btn {
                    position:absolute;right:16px;top:50%;transform:translateY(-50%);
                    background:none;border:none;cursor:pointer;
                    color:var(--sage-light);display:flex;align-items:center;
                    transition:color .2s;padding:0;
                }
                .eye-btn:hover { color:var(--g500); }

                input[type="text"],
                input[type="password"] {
                    width:100%;padding:15px 46px 15px 46px;
                    background:var(--white);border:1.5px solid var(--border);
                    border-radius:12px;font-size:14.5px;
                    font-family:'Outfit',sans-serif;font-weight:400;
                    color:var(--ink);outline:none;
                    transition:border-color .2s,box-shadow .2s;
                    -webkit-appearance:none;
                }
                input::placeholder { color:var(--sage-light); }
                input:focus {
                    border-color:var(--g400);
                    box-shadow:0 0 0 4px rgba(26,171,116,.10);
                }

                /* Submit */
                .submit-btn {
                    width:100%;margin-top:8px;padding:16px 24px;
                    background:var(--g500);color:white;border:none;border-radius:12px;
                    font-size:15px;font-family:'Outfit',sans-serif;font-weight:600;
                    cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;
                    transition:background .2s,transform .15s,box-shadow .2s;
                    box-shadow:0 4px 20px rgba(26,171,116,.30);letter-spacing:.01em;
                }
                .submit-btn:hover:not(:disabled) {
                    background:var(--g600);transform:translateY(-1px);
                    box-shadow:0 8px 28px rgba(26,171,116,.36);
                }
                .submit-btn:active:not(:disabled) { transform:translateY(0);box-shadow:0 2px 10px rgba(26,171,116,.20); }
                .submit-btn:disabled { opacity:.55;cursor:not-allowed; }

                .spinner {
                    width:17px;height:17px;
                    border:2.5px solid rgba(255,255,255,.35);
                    border-top-color:white;border-radius:50%;
                    animation:spin .7s linear infinite;
                }

                /* Roles */
                .roles-section {
                    margin-top:28px;padding-top:28px;
                    border-top:1px solid var(--border);
                }
                .roles-label {
                    font-size:11px;font-weight:600;letter-spacing:.08em;
                    text-transform:uppercase;color:var(--soft);
                    text-align:center;margin-bottom:12px;
                }
                .roles-row {
                    display:flex;flex-wrap:wrap;justify-content:center;gap:8px;
                }
                .role-chip {
                    padding:5px 12px;
                    background:var(--g50);border:1px solid var(--g100);
                    border-radius:100px;font-size:11.5px;font-weight:500;
                    color:var(--mid);white-space:nowrap;
                }

                /* Secure note */
                .secure-note {
                    margin-top:10px;text-align:center;
                }
                .secure-note p {
                    font-size:11.5px;color:var(--soft);line-height:1.6;
                }

                /* ─── ANIMATIONS ─── */
                @keyframes rise {
                    from { opacity:0;transform:translateY(20px); }
                    to   { opacity:1;transform:translateY(0); }
                }
                @keyframes spin { to { transform:rotate(360deg); } }
                @keyframes float {
                    0%,100% { transform:translateY(0); }
                    50%     { transform:translateY(-8px); }
                }
                @keyframes pulse-dot {
                    0%,100% { opacity:1;transform:scale(1); }
                    50%     { opacity:.6;transform:scale(.85); }
                }

                /* ─── RESPONSIVE ─── */
                @media (max-width:1024px) {
                    .page { grid-template-columns:1fr; }
                    .hero { display:none; }
                    .form-side { padding:48px 32px; }
                    .form-side::before { display:none; }
                }
                @media (max-width:480px) {
                    .form-side { padding:40px 24px; }
                    .form-title { font-size:30px; }
                }
            `}</style>

            <div className="page">
                <div className="blob b1" />
                <div className="blob b2" />
                <div className="blob b3" />
                <div className="grid-bg" />

                {/* ── LEFT HERO ── */}
                <div className="hero">
                    <div className="brand">
                        <div className="brand-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                            </svg>
                        </div>
                        <span className="brand-name">Avani <span>OS</span></span>
                    </div>

                    <div className="hero-body">
                        <div className="badge">
                            <span className="badge-dot" />
                            <span className="badge-text">Hospital Management Platform</span>
                        </div>
                        <h1 className="hero-hl">
                            Healthcare,
                            <span className="accent">Elevated.</span>
                        </h1>
                        <p className="hero-desc">
                            A unified clinical platform designed for modern hospitals — connecting patients, labs, pharmacy, and administration in one seamless workspace.
                        </p>
                        <div className="stats">
                            <div className="stat">
                                <span className="stat-num">360°</span>
                                <span className="stat-lbl">Patient View</span>
                            </div>
                            <div className="stat-div" />
                            <div className="stat">
                                <span className="stat-num">Live</span>
                                <span className="stat-lbl">Lab Sync</span>
                            </div>
                            <div className="stat-div" />
                            <div className="stat">
                                <span className="stat-num">AI</span>
                                <span className="stat-lbl">Workflows</span>
                            </div>
                        </div>
                    </div>

                    <div className="float-card">
                        <div className="card-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            </svg>
                        </div>
                        <div>
                            <div className="card-main">Secure &amp; HIPAA Ready</div>
                            <div className="card-sub">Enterprise-grade data protection</div>
                        </div>
                    </div>
                </div>

                {/* ── RIGHT FORM ── */}
                <div className="form-side">
                    <div className="form-wrap">
                        <p className="form-tag">Staff Portal</p>
                        <h2 className="form-title">Welcome<br />Back</h2>
                        <p className="form-sub">Sign in to access your workspace</p>

                        {/* Timeout notice */}
                        {isTimeout && (
                            <div className="timeout-box">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                                </svg>
                                Your session expired due to inactivity. Please sign in again.
                            </div>
                        )}

                        {/* Error */}
                        {state?.error && (
                            <div className="error-box">
                                <div className="err-icon">!</div>
                                {state.error}
                            </div>
                        )}

                        <form action={loginAction}>
                            <div className="fields">
                                <div>
                                    <label htmlFor="login-username" className="field-lbl">Username</label>
                                    <div className="input-wrap">
                                        <span className="input-icon">
                                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                                <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                                            </svg>
                                        </span>
                                        <input
                                            id="login-username"
                                            name="username"
                                            type="text"
                                            required
                                            autoComplete="username"
                                            placeholder="Enter your username"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="login-password" className="field-lbl">Password</label>
                                    <div className="input-wrap">
                                        <span className="input-icon">
                                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                                <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                            </svg>
                                        </span>
                                        <input
                                            id="login-password"
                                            name="password"
                                            type={showPassword ? 'text' : 'password'}
                                            required
                                            autoComplete="current-password"
                                            placeholder="Enter your password"
                                        />
                                        <button
                                            type="button"
                                            className="eye-btn"
                                            onClick={() => setShowPassword(!showPassword)}
                                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                                        >
                                            {showPassword ? (
                                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" />
                                                </svg>
                                            ) : (
                                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                                                </svg>
                                            )}
                                        </button>
                                    </div>
                                </div>

                                <button
                                    id="login-submit"
                                    type="submit"
                                    disabled={isPending}
                                    className="submit-btn"
                                >
                                    {isPending ? (
                                        <>
                                            <span className="spinner" />
                                            Authenticating…
                                        </>
                                    ) : (
                                        <>
                                            Sign In
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M5 12h14M12 5l7 7-7 7" />
                                            </svg>
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>

                        {/* Roles */}
                        <div className="roles-section">
                            <p className="roles-label">Authorized Roles</p>
                            <div className="roles-row">
                                {['Admin', 'Doctor', 'Receptionist', 'Lab Tech', 'Pharmacist'].map(role => (
                                    <span key={role} className="role-chip">{role}</span>
                                ))}
                            </div>
                            <div className="secure-note" style={{ marginTop: 20 }}>
                                <p>256-bit encrypted · HIPAA-compliant · Audit-logged</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div style={{ minHeight: '100vh', background: '#f8fbf9' }} />}>
            <LoginForm />
        </Suspense>
    );
}
