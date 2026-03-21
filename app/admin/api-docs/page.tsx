'use client';

import { useState, useEffect } from 'react';
import {
    BookOpen, Shield, Globe, Key, Plus, Trash2, Copy, Check,
    Activity, FileText, CreditCard, Upload, Stethoscope, Server,
    AlertTriangle, Zap, Lock, ArrowRight, Search,
} from 'lucide-react';
import EndpointCard from './components/EndpointCard';
import {
    createZealthixApiKey,
    listZealthixApiKeys,
    revokeZealthixApiKey,
    getZealthixStats,
} from '@/app/actions/zealthix-actions';

// =============================================
// EXTERNAL INTEGRATION ENDPOINT DEFINITIONS
// =============================================

const EXTERNAL_ENDPOINTS = [
    {
        method: 'POST' as const,
        path: '/api/zealthix/patient/find',
        description: 'Search and find patient details from HIS',
        auth: 'X-Api-Key header (required)',
        requestBody: {
            patientId: '728934',
            mobileNumber: '',
            ipNumber: '',
            abhaNumber: '',
            ipdVisitType: '',
        },
        responseExample: {
            success: true,
            message: 'success',
            data: [
                {
                    patientId: 'AVN-20250101-0001',
                    name: 'John Doe',
                    email: 'john@example.com',
                    phone: '9876543210',
                    visitId: 'ADM-001',
                    departmentName: 'Cardiology',
                    doctorName: 'Dr. Smith',
                    visitDateTime: '2025-01-15T10:00:00',
                    visitType: 'INPATIENT',
                    doctorId: 'doc-001',
                    amount: 25000,
                    type: 'IPD',
                    payerId: '1',
                },
            ],
        },
        requestFields: [
            { name: 'patientId', type: 'string', required: false, description: 'Patient UHID from HIS' },
            { name: 'mobileNumber', type: 'string', required: false, description: 'Patient mobile number' },
            { name: 'ipNumber', type: 'string', required: false, description: 'Inpatient admission ID' },
            { name: 'abhaNumber', type: 'string', required: false, description: 'ABHA (Ayushman Bharat) number' },
            { name: 'ipdVisitType', type: 'string', required: false, description: 'OUTPATIENT | INPATIENT | FINANCIAL_COUNSELLING' },
        ],
        fieldMappings: [
            { externalField: 'patientId', ourField: 'OPD_REG.patient_id', description: 'Patient UHID' },
            { externalField: 'name', ourField: 'OPD_REG.full_name', description: 'Patient full name' },
            { externalField: 'visitId', ourField: 'admissions.admission_id', description: 'Visit/admission ID' },
            { externalField: 'doctorName', ourField: 'admissions.doctor_name', description: 'Treating doctor' },
            { externalField: 'amount', ourField: 'invoices.net_amount', description: 'Invoice amount' },
            { externalField: 'payerId', ourField: 'payers.id', description: 'Payer/provider ID' },
        ],
    },
    {
        method: 'POST' as const,
        path: '/api/zealthix/patient/visit',
        description: 'Get comprehensive patient visit details including treatment, billing, and case information',
        auth: 'X-Api-Key header (required)',
        requestBody: {
            visitId: '2343',
            visitDateTime: '2022-01-01T00:00:00',
            visitType: 'INPATIENT',
        },
        responseExample: {
            success: true,
            message: 'success',
            data: {
                patientDetails: {
                    patientName: 'SAURAV',
                    mobileNumber: '9876543210',
                    memberId: '2342234',
                    emailId: 'saurav@example.com',
                    abhaId: '91315530341111',
                    payer: 'Payer Pvt. Ltd.',
                    payerID: '522920',
                    policyNumber: 'POLICYNUMBER',
                    gender: 'Male',
                    patientAge: '24',
                    policyType: 'Corporate',
                    patientPayable: 58275,
                },
                treatmentDetails: {
                    dateOfAdmission: '1767205800',
                    dateOfDischarge: '1767724200',
                    lineOfTreatment: 'Surgical',
                    diagnosis: 'Gastric ulcer',
                    admissionType: 'Normal',
                },
                doctorDetails: {
                    doctorName: 'Dr. Team',
                    roomType: 'General Ward',
                    departmentName: 'Neurology',
                },
                billDetails: {
                    infraCharges: 9600,
                    consultation: 0,
                    otCharges: 500,
                    surgeon: 40950,
                    laboratoryInvestigation: 500,
                    pharmacy: 1000,
                    otherExpenses: 5725,
                },
            },
        },
        requestFields: [
            { name: 'visitId', type: 'string', required: true, description: 'Visit/admission ID' },
            { name: 'visitDateTime', type: 'string', required: false, description: 'Visit date-time (ISO format)' },
            { name: 'visitType', type: 'string', required: true, description: 'OUTPATIENT | INPATIENT | FINANCIAL_COUNSELLING' },
        ],
        fieldMappings: [
            { externalField: 'patientDetails', ourField: 'OPD_REG + policies', description: 'Patient + policy info combined' },
            { externalField: 'treatmentDetails', ourField: 'admissions.*', description: 'Admission dates, diagnosis, treatment line' },
            { externalField: 'doctorDetails', ourField: 'User + wards', description: 'Doctor info + room/ward type' },
            { externalField: 'billDetails', ourField: 'invoice_items (aggregated)', description: 'Items grouped by department category' },
            { externalField: 'caseDetails', ourField: 'admissions.case_*', description: 'Accident/injury case fields' },
            { externalField: 'dischargeInitiationDetails', ourField: 'admissions + payments', description: 'Discharge + payment summary' },
        ],
    },
    {
        method: 'POST' as const,
        path: '/api/zealthix/visit/documents',
        description: 'Retrieve patient visit documents as base64-encoded files',
        auth: 'X-Api-Key header (required)',
        requestBody: {
            visitId: '2343',
            visitDateTime: '2022-01-01T00:00:00',
            visitType: 'INPATIENT',
        },
        responseExample: {
            success: true,
            message: 'success',
            data: {
                documents: [
                    {
                        id: 'INV-1',
                        title: 'Invoice INV-20250115-0001',
                        contentType: 'application/pdf',
                        attachmentType: 'Bill',
                        base64: 'JVBERi0xLjcK...',
                    },
                    {
                        id: 'DS-ADM001',
                        title: 'Discharge Summary',
                        contentType: 'application/pdf',
                        attachmentType: 'DischargeSummary',
                        base64: 'JVBERi0xLjQK...',
                    },
                ],
            },
        },
        requestFields: [
            { name: 'visitId', type: 'string', required: true, description: 'Visit/admission ID' },
            { name: 'visitDateTime', type: 'string', required: false, description: 'Visit date-time (ISO format)' },
            { name: 'visitType', type: 'string', required: true, description: 'OUTPATIENT | INPATIENT | FINANCIAL_COUNSELLING' },
        ],
        fieldMappings: [
            { externalField: 'documents[].base64', ourField: 'PDF routes + Supabase files', description: 'Generated from internal PDF APIs and stored documents' },
            { externalField: 'attachmentType: Bill', ourField: '/api/invoice/[id]/pdf', description: 'Invoice PDF generated on-the-fly' },
            { externalField: 'attachmentType: DischargeSummary', ourField: '/api/discharge/[id]/pdf', description: 'Discharge summary PDF' },
            { externalField: 'attachmentType: Investigation', ourField: 'lab_orders.report_url', description: 'Lab report files from storage' },
            { externalField: 'attachmentType: Consent', ourField: 'admissions.consent_signature_url', description: 'Consent form from storage' },
        ],
    },
    {
        method: 'POST' as const,
        path: '/api/zealthix/claim/update',
        description: 'Receive claim status updates and sync with HIS records',
        auth: 'X-Api-Key header (required)',
        requestBody: {
            claimNumber: 'C2874001XCB',
            patientName: 'Deepak Kumar',
            patientMobileNumber: '7073989123',
            patientEmailId: 'deepak@example.com',
            patientDob: '1995-04-23',
            patientGender: 'Male',
            policyNo: '234342343',
            actionStatus: 'PREAUTH',
            status: 'Pre Auth Initiated',
            lineOfTreatment: 'Medical Management',
            admissionDateTime: '2025-10-08T00:00:00',
            dischargeDateTime: '2025-10-15T00:00:00',
            doctorName: 'Dr. Sharma',
            roomType: 'General Ward',
            totalAmount: 3213.0,
            approvedAmount: 0.0,
            settledAmount: 0.0,
            tdsAmount: 0.0,
            remarks: 'Pre-auth initiated',
        },
        responseExample: {
            success: true,
            message: 'Claim updated successfully',
            data: {},
        },
        requestFields: [
            { name: 'claimNumber', type: 'string', required: true, description: 'External claim reference number' },
            { name: 'patientName', type: 'string', required: true, description: 'Patient full name' },
            { name: 'patientMobileNumber', type: 'string', required: true, description: 'Patient mobile number' },
            { name: 'patientEmailId', type: 'string', required: true, description: 'Patient email' },
            { name: 'policyNo', type: 'string', required: true, description: 'Policy number' },
            { name: 'actionStatus', type: 'string', required: true, description: 'PREAUTH | ENHANCEMENT | DISCHARGE | FINAL' },
            { name: 'status', type: 'string', required: true, description: 'Human-readable status text' },
            { name: 'totalAmount', type: 'number', required: true, description: 'Total claim amount' },
            { name: 'approvedAmount', type: 'number', required: false, description: 'Amount approved' },
            { name: 'settledAmount', type: 'number', required: false, description: 'Amount settled/paid' },
            { name: 'tdsAmount', type: 'number', required: false, description: 'TDS deducted' },
            { name: 'remarks', type: 'string', required: false, description: 'Additional remarks' },
            { name: 'lineOfTreatment', type: 'string', required: true, description: 'Medical Management / Surgical' },
            { name: 'doctorName', type: 'string', required: true, description: 'Treating doctor name' },
            { name: 'roomType', type: 'string', required: true, description: 'General Ward / Semi-Private / Private / ICU' },
            { name: 'admissionDateTime', type: 'string', required: true, description: 'Admission date-time (ISO format)' },
            { name: 'dischargeDateTime', type: 'string', required: true, description: 'Discharge date-time (ISO format)' },
            { name: 'conditions', type: 'object', required: false, description: 'Medical conditions, procedures, medications' },
            { name: 'items', type: 'object', required: false, description: 'Charge breakdown (otCharges, bedCharges, etc.)' },
            { name: 'attachment', type: 'object', required: false, description: 'Attached documents' },
        ],
        fieldMappings: [
            { externalField: 'claimNumber', ourField: 'claims.external_claim_number', description: 'Stored as external reference' },
            { externalField: 'actionStatus', ourField: 'claims.action_status', description: 'Mapped to our statuses (Submitted/UnderReview/Approved/Settled)' },
            { externalField: 'approvedAmount', ourField: 'claims.approved_amount', description: 'Updates claim approved amount' },
            { externalField: 'settledAmount', ourField: 'claims.settled_amount + payments', description: 'Creates payment record on settlement' },
            { externalField: 'totalAmount', ourField: 'claims.claimed_amount', description: 'Total claim amount' },
            { externalField: 'tdsAmount', ourField: 'claims.tds_amount', description: 'TDS deduction tracked' },
        ],
    },
];

// =============================================
// HIMS INTERNAL API DEFINITIONS
// =============================================

const HIMS_API_SECTIONS = [
    {
        title: 'System',
        icon: Server,
        description: 'Core system endpoints for health checks and session management',
        endpoints: [
            { method: 'GET' as const, path: '/api/health', description: 'Health check - verify database connectivity' },
            { method: 'GET' as const, path: '/api/session', description: 'Get current user session (staff or patient)' },
            { method: 'GET' as const, path: '/api/org-lookup', description: 'Organization lookup by slug for multi-tenant resolution' },
        ],
    },
    {
        title: 'Payments (Razorpay)',
        icon: CreditCard,
        description: 'Payment processing and verification endpoints',
        endpoints: [
            { method: 'POST' as const, path: '/api/razorpay/create-order', description: 'Create Razorpay payment order for invoice' },
            { method: 'POST' as const, path: '/api/razorpay/verify-payment', description: 'Verify Razorpay payment signature and record payment' },
            { method: 'POST' as const, path: '/api/razorpay/appointment-order', description: 'Create Razorpay order for appointment booking' },
            { method: 'POST' as const, path: '/api/razorpay/verify-appointment', description: 'Verify appointment payment' },
        ],
    },
    {
        title: 'Reports & PDFs',
        icon: FileText,
        description: 'Generate and download various medical and financial documents',
        endpoints: [
            { method: 'GET' as const, path: '/api/invoice/[id]/pdf', description: 'Generate invoice PDF with GST breakdown' },
            { method: 'GET' as const, path: '/api/discharge/[admissionId]/pdf', description: 'Generate discharge summary PDF' },
            { method: 'GET' as const, path: '/api/reports/prescription/pdf', description: 'Generate prescription PDF' },
            { method: 'GET' as const, path: '/api/reports/lab/pdf', description: 'Generate lab report PDF' },
            { method: 'GET' as const, path: '/api/reports/financial/pdf', description: 'Generate financial report PDF' },
        ],
    },
    {
        title: 'Data Import',
        icon: Upload,
        description: 'Bulk data import via CSV/Excel files',
        endpoints: [
            { method: 'POST' as const, path: '/api/import/upload', description: 'Upload CSV/Excel file for data import' },
            { method: 'GET' as const, path: '/api/import/progress/[jobId]', description: 'Get import job progress status' },
            { method: 'GET' as const, path: '/api/import/template/[type]', description: 'Download import template for data type' },
        ],
    },
    {
        title: 'Verification',
        icon: Stethoscope,
        description: 'Lab and pharmacy order verification',
        endpoints: [
            { method: 'POST' as const, path: '/api/verify-lab-pharmacy', description: 'Verify lab and pharmacy order details' },
        ],
    },
];

// =============================================
// MAIN PAGE COMPONENT
// =============================================

export default function ApiDocsPage() {
    const [activeTab, setActiveTab] = useState<'hims' | 'external'>('hims');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [apiKeys, setApiKeys] = useState<any[]>([]);
    const [stats, setStats] = useState({ activeKeys: 0, totalApiCalls: 0, recentClaims: 0 });
    const [showNewKeyModal, setShowNewKeyModal] = useState(false);
    const [newKeyLabel, setNewKeyLabel] = useState('');
    const [generatedKey, setGeneratedKey] = useState('');
    const [keyCopied, setKeyCopied] = useState(false);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        loadApiKeys();
        loadStats();
    }, []);

    async function loadApiKeys() {
        const res = await listZealthixApiKeys();
        if (res.success && res.data) setApiKeys(res.data);
    }

    async function loadStats() {
        const res = await getZealthixStats();
        if (res.success && res.data) setStats(res.data);
    }

    async function handleCreateKey() {
        if (!newKeyLabel.trim()) return;
        setLoading(true);
        const res = await createZealthixApiKey(newKeyLabel.trim());
        if (res.success && res.data) {
            setGeneratedKey(res.data.apiKey);
            await loadApiKeys();
            await loadStats();
        }
        setLoading(false);
    }

    async function handleRevokeKey(id: string) {
        if (!confirm('Are you sure you want to revoke this API key? This cannot be undone.')) return;
        await revokeZealthixApiKey(id);
        await loadApiKeys();
        await loadStats();
    }

    function copyKey() {
        navigator.clipboard.writeText(generatedKey);
        setKeyCopied(true);
        setTimeout(() => setKeyCopied(false), 2000);
    }

    const filteredExternalEndpoints = EXTERNAL_ENDPOINTS.filter(
        (ep) =>
            !searchQuery ||
            ep.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
            ep.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredHimsSections = HIMS_API_SECTIONS.map((section) => ({
        ...section,
        endpoints: section.endpoints.filter(
            (ep) =>
                !searchQuery ||
                ep.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
                ep.description.toLowerCase().includes(searchQuery.toLowerCase())
        ),
    })).filter((section) => section.endpoints.length > 0);

    return (
        <div className="min-h-screen p-4 sm:p-6 lg:p-8" style={{ backgroundColor: 'var(--admin-bg)' }}>
            {/* Hero Header */}
            <div className="relative mb-8 overflow-hidden rounded-2xl border border-gray-700/40 bg-gradient-to-br from-gray-800/80 via-gray-800/60 to-gray-900/80 p-6 sm:p-8">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-600/10 via-transparent to-purple-600/5" />
                <div className="relative flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex items-start gap-4">
                        <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20">
                            <BookOpen className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white tracking-tight">API Documentation</h1>
                            <p className="text-sm text-gray-400 mt-1 max-w-lg">
                                Explore available endpoints, manage API keys, and test integrations for your Hospital OS instance.
                            </p>
                            <div className="flex items-center gap-3 mt-3">
                                <span className="inline-flex items-center gap-1.5 text-xs text-gray-400 bg-gray-700/40 px-2.5 py-1 rounded-full">
                                    <Lock className="h-3 w-3" />
                                    API Key Auth
                                </span>
                                <span className="inline-flex items-center gap-1.5 text-xs text-gray-400 bg-gray-700/40 px-2.5 py-1 rounded-full">
                                    <Zap className="h-3 w-3" />
                                    REST / JSON
                                </span>
                                <span className="inline-flex items-center gap-1.5 text-xs text-gray-400 bg-gray-700/40 px-2.5 py-1 rounded-full">
                                    <Shield className="h-3 w-3" />
                                    Multi-tenant
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Quick Stats */}
                    <div className="flex gap-3 sm:gap-4">
                        <div className="text-center px-4 py-2 bg-gray-900/40 rounded-xl border border-gray-700/30">
                            <p className="text-xl font-bold text-white">{stats.activeKeys}</p>
                            <p className="text-[11px] text-gray-500 font-medium mt-0.5">Active Keys</p>
                        </div>
                        <div className="text-center px-4 py-2 bg-gray-900/40 rounded-xl border border-gray-700/30">
                            <p className="text-xl font-bold text-white">{stats.totalApiCalls}</p>
                            <p className="text-[11px] text-gray-500 font-medium mt-0.5">API Calls</p>
                        </div>
                        <div className="text-center px-4 py-2 bg-gray-900/40 rounded-xl border border-gray-700/30">
                            <p className="text-xl font-bold text-white">{stats.recentClaims}</p>
                            <p className="text-[11px] text-gray-500 font-medium mt-0.5">Claims</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Controls Row: Tabs + Search */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex gap-1 p-1 bg-gray-800/60 rounded-xl border border-gray-700/30">
                    <button
                        onClick={() => setActiveTab('hims')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                            activeTab === 'hims'
                                ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md shadow-blue-500/20'
                                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/30'
                        }`}
                    >
                        <Globe className="h-4 w-4" />
                        Internal APIs
                    </button>
                    <button
                        onClick={() => setActiveTab('external')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                            activeTab === 'external'
                                ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md shadow-blue-500/20'
                                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/30'
                        }`}
                    >
                        <Zap className="h-4 w-4" />
                        External Integration
                    </button>
                </div>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search endpoints..."
                        className="pl-9 pr-4 py-2 w-full sm:w-64 bg-gray-800/60 border border-gray-700/30 rounded-xl text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
                    />
                </div>
            </div>

            {/* HIMS Tab */}
            {activeTab === 'hims' && (
                <div className="space-y-6">
                    <div className="bg-gray-800/30 border border-gray-700/30 rounded-2xl p-5">
                        <div className="flex items-start gap-3">
                            <div className="p-2 bg-emerald-500/10 rounded-lg">
                                <Server className="h-5 w-5 text-emerald-400" />
                            </div>
                            <div>
                                <h2 className="text-base font-semibold text-white mb-1">Hospital Information Management System</h2>
                                <p className="text-sm text-gray-400">
                                    Internal APIs powering Hospital OS. Used for payment processing,
                                    report generation, data import, and system health monitoring.
                                </p>
                            </div>
                        </div>
                    </div>

                    {filteredHimsSections.map((section) => {
                        const Icon = section.icon;
                        return (
                            <div key={section.title} className="space-y-2">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-1.5 bg-gray-700/40 rounded-lg">
                                        <Icon className="h-4 w-4 text-gray-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold text-white">
                                            {section.title}
                                        </h3>
                                        <p className="text-xs text-gray-500">{section.description}</p>
                                    </div>
                                    <div className="ml-auto">
                                        <span className="text-[11px] text-gray-600 bg-gray-800/60 px-2 py-0.5 rounded-full">
                                            {section.endpoints.length} endpoint{section.endpoints.length !== 1 ? 's' : ''}
                                        </span>
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    {section.endpoints.map((ep) => (
                                        <div
                                            key={ep.path}
                                            className="group flex items-center gap-3 px-4 py-3 bg-gray-800/20 border border-gray-700/20 rounded-xl hover:bg-gray-800/40 hover:border-gray-700/40 transition-all cursor-default"
                                        >
                                            <span
                                                className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase border shrink-0 ${
                                                    ep.method === 'GET'
                                                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                                        : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                                                }`}
                                            >
                                                {ep.method}
                                            </span>
                                            <code className="text-sm text-gray-200 font-mono">{ep.path}</code>
                                            <ArrowRight className="h-3 w-3 text-gray-600 shrink-0 hidden sm:block" />
                                            <span className="text-sm text-gray-500 hidden sm:inline truncate">{ep.description}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}

                    {filteredHimsSections.length === 0 && searchQuery && (
                        <div className="text-center py-12">
                            <Search className="h-8 w-8 text-gray-600 mx-auto mb-3" />
                            <p className="text-sm text-gray-500">No endpoints match &ldquo;{searchQuery}&rdquo;</p>
                        </div>
                    )}
                </div>
            )}

            {/* External Integration Tab */}
            {activeTab === 'external' && (
                <div className="space-y-6">
                    {/* Overview */}
                    <div className="bg-gradient-to-br from-blue-900/15 to-indigo-900/10 border border-blue-700/20 rounded-2xl p-5">
                        <div className="flex items-start gap-3">
                            <div className="p-2.5 bg-blue-500/15 rounded-xl">
                                <Zap className="h-5 w-5 text-blue-400" />
                            </div>
                            <div>
                                <h2 className="text-base font-semibold text-white mb-1">External Integration APIs</h2>
                                <p className="text-sm text-gray-400 mb-3">
                                    Real-time integration endpoints for third-party partners. These endpoints
                                    allow authorized systems to fetch patient data, visit details, documents,
                                    and push claim status updates.
                                </p>
                                <div className="flex flex-wrap items-center gap-3 text-xs">
                                    <span className="inline-flex items-center gap-1.5 text-gray-400 bg-gray-800/60 px-2.5 py-1 rounded-full border border-gray-700/30">
                                        <Lock className="h-3 w-3 text-blue-400" />
                                        X-Api-Key Header
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 text-gray-400 bg-gray-800/60 px-2.5 py-1 rounded-full border border-gray-700/30">
                                        <Activity className="h-3 w-3 text-emerald-400" />
                                        JSON Response
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 text-gray-400 bg-gray-800/60 px-2.5 py-1 rounded-full border border-gray-700/30">
                                        <Shield className="h-3 w-3 text-purple-400" />
                                        Rate Limited
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* API Key Management */}
                    <div className="bg-gray-800/30 border border-gray-700/30 rounded-2xl overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700/20">
                            <div className="flex items-center gap-2.5">
                                <div className="p-1.5 bg-amber-500/10 rounded-lg">
                                    <Key className="h-4 w-4 text-amber-400" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-semibold text-white">API Key Management</h3>
                                    <p className="text-xs text-gray-500">Generate and manage access keys for external partners</p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    setShowNewKeyModal(true);
                                    setGeneratedKey('');
                                    setNewKeyLabel('');
                                }}
                                className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-xs font-medium rounded-xl transition-all shadow-sm shadow-blue-500/20"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                Generate Key
                            </button>
                        </div>

                        {apiKeys.length === 0 ? (
                            <div className="px-5 py-10 text-center">
                                <div className="inline-flex p-3 bg-gray-700/20 rounded-2xl mb-3">
                                    <Key className="h-7 w-7 text-gray-600" />
                                </div>
                                <p className="text-sm text-gray-400 font-medium">No API keys generated yet</p>
                                <p className="text-xs text-gray-500 mt-1">Create a key to allow partners to integrate with your system</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-700/20">
                                {apiKeys.map((key) => (
                                    <div key={key.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-700/10 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-2.5 h-2.5 rounded-full ring-2 ${
                                                key.is_active
                                                    ? 'bg-emerald-400 ring-emerald-400/20'
                                                    : 'bg-gray-600 ring-gray-600/20'
                                            }`} />
                                            <div>
                                                <p className="text-sm text-gray-200 font-medium">{key.label || 'API Key'}</p>
                                                <code className="text-xs text-gray-500 font-mono">{key.masked_key}</code>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-right hidden sm:block">
                                                <p className="text-xs text-gray-500">
                                                    Created {new Date(key.created_at).toLocaleDateString()}
                                                </p>
                                                {key.last_used_at && (
                                                    <p className="text-[11px] text-gray-600">
                                                        Last used {new Date(key.last_used_at).toLocaleString()}
                                                    </p>
                                                )}
                                            </div>
                                            {key.is_active ? (
                                                <button
                                                    onClick={() => handleRevokeKey(key.id)}
                                                    className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                                                    title="Revoke key"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            ) : (
                                                <span className="text-[11px] text-red-400 bg-red-500/10 px-2.5 py-1 rounded-lg font-medium">Revoked</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* API Endpoints */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2.5">
                                <div className="p-1.5 bg-blue-500/10 rounded-lg">
                                    <Globe className="h-4 w-4 text-blue-400" />
                                </div>
                                <h3 className="text-sm font-semibold text-white">
                                    Endpoints
                                </h3>
                                <span className="text-[11px] text-gray-500 bg-gray-800/60 px-2 py-0.5 rounded-full">
                                    {filteredExternalEndpoints.length} available
                                </span>
                            </div>
                        </div>
                        <div className="space-y-3">
                            {filteredExternalEndpoints.map((ep) => (
                                <EndpointCard
                                    key={ep.path}
                                    method={ep.method}
                                    path={ep.path}
                                    description={ep.description}
                                    auth={ep.auth}
                                    requestBody={ep.requestBody}
                                    responseExample={ep.responseExample}
                                    requestFields={ep.requestFields}
                                    fieldMappings={ep.fieldMappings}
                                    showTestPanel
                                />
                            ))}
                        </div>

                        {filteredExternalEndpoints.length === 0 && searchQuery && (
                            <div className="text-center py-12">
                                <Search className="h-8 w-8 text-gray-600 mx-auto mb-3" />
                                <p className="text-sm text-gray-500">No endpoints match &ldquo;{searchQuery}&rdquo;</p>
                            </div>
                        )}
                    </div>

                    {/* Error Codes Reference */}
                    <div className="bg-gray-800/30 border border-gray-700/30 rounded-2xl p-5">
                        <div className="flex items-center gap-2.5 mb-4">
                            <div className="p-1.5 bg-amber-500/10 rounded-lg">
                                <AlertTriangle className="h-4 w-4 text-amber-400" />
                            </div>
                            <h3 className="text-sm font-semibold text-white">Error Responses</h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {[
                                { code: '400', color: 'amber', label: 'Bad Request', desc: 'Missing or invalid parameters' },
                                { code: '401', color: 'red', label: 'Unauthorized', desc: 'Missing or invalid X-Api-Key header' },
                                { code: '404', color: 'red', label: 'Not Found', desc: 'Patient, visit, or claim not found' },
                                { code: '500', color: 'red', label: 'Server Error', desc: 'Unexpected error processing request' },
                            ].map((err) => (
                                <div key={err.code} className="flex items-center gap-3 px-3.5 py-2.5 bg-gray-900/30 border border-gray-700/20 rounded-xl">
                                    <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${
                                        err.color === 'amber'
                                            ? 'bg-amber-500/15 text-amber-400'
                                            : 'bg-red-500/15 text-red-400'
                                    }`}>
                                        {err.code}
                                    </span>
                                    <div>
                                        <p className="text-xs font-medium text-gray-300">{err.label}</p>
                                        <p className="text-[11px] text-gray-500">{err.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* New Key Modal */}
            {showNewKeyModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
                    <div className="bg-gray-800 border border-gray-700/50 rounded-2xl w-full max-w-lg shadow-2xl shadow-black/40">
                        <div className="px-6 py-4 border-b border-gray-700/30">
                            <div className="flex items-center gap-2.5">
                                <div className="p-1.5 bg-blue-500/10 rounded-lg">
                                    <Key className="h-4 w-4 text-blue-400" />
                                </div>
                                <h3 className="text-base font-semibold text-white">
                                    {generatedKey ? 'Key Generated Successfully' : 'Generate New API Key'}
                                </h3>
                            </div>
                        </div>

                        <div className="px-6 py-5">
                            {!generatedKey ? (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1.5">
                                            Label
                                        </label>
                                        <input
                                            type="text"
                                            value={newKeyLabel}
                                            onChange={(e) => setNewKeyLabel(e.target.value)}
                                            placeholder="e.g., Partner Integration - Production"
                                            className="w-full px-3.5 py-2.5 bg-gray-900/60 border border-gray-700/50 rounded-xl text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
                                        />
                                    </div>
                                    <div className="flex items-start gap-2.5 text-xs text-gray-400 bg-amber-500/5 border border-amber-500/15 rounded-xl px-3.5 py-2.5">
                                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                                        <p>The API key will only be displayed once after generation. Make sure to copy and store it in a secure location.</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                                        <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                                        <p className="text-sm text-emerald-400 font-medium">API key generated successfully!</p>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-400 mb-1.5">
                                            Your API Key (copy now - it won&apos;t be shown again)
                                        </label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={generatedKey}
                                                readOnly
                                                className="flex-1 px-3.5 py-2.5 bg-gray-900 border border-gray-700/50 rounded-xl text-xs text-gray-200 font-mono"
                                            />
                                            <button
                                                onClick={copyKey}
                                                className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-xs font-medium rounded-xl transition-all shadow-sm"
                                            >
                                                {keyCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                                {keyCopied ? 'Copied!' : 'Copy'}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2.5 text-xs text-amber-400 bg-amber-500/5 border border-amber-500/15 rounded-xl px-3.5 py-2.5">
                                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                        <p>Store this key securely and share it with the integration partner for their configuration.</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-4 border-t border-gray-700/30 flex justify-end gap-2">
                            <button
                                onClick={() => setShowNewKeyModal(false)}
                                className="px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-700/30 rounded-xl transition-all"
                            >
                                {generatedKey ? 'Close' : 'Cancel'}
                            </button>
                            {!generatedKey && (
                                <button
                                    onClick={handleCreateKey}
                                    disabled={!newKeyLabel.trim() || loading}
                                    className="px-5 py-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:from-blue-600/50 disabled:to-blue-500/50 text-white text-sm font-medium rounded-xl transition-all shadow-sm shadow-blue-500/20"
                                >
                                    {loading ? 'Generating...' : 'Generate Key'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
