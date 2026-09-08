import { PrismaClient } from '@prisma/client';
import { validateServerEnv } from '@/app/lib/env';

// Guard: this module must only ever run server-side. If a client component's
// import graph accidentally pulls it into the browser bundle, do NOT validate
// env or instantiate Prisma there (both would crash). The client never actually
// calls these — data access always goes through server actions.
const isServer = typeof window === 'undefined';

if (isServer) validateServerEnv();

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = isServer
    ? (globalForPrisma.prisma || new PrismaClient())
    : (undefined as unknown as PrismaClient);

// Cache on globalThis in every environment, not just dev. Next.js can
// re-evaluate this module more than once per server process (route/action
// bundle splitting); without an unconditional cache each re-evaluation opens
// a brand-new PrismaClient with its own connection pool, silently multiplying
// DB connections in production until the RDS connection ceiling is hit.
if (isServer) globalForPrisma.prisma = prisma;

// Models that support is_archived field for warm/cold archival
const ARCHIVABLE_MODELS = new Set([
    'OPD_REG', 'invoices', 'admissions', 'lab_orders', 'Clinical_EHR',
]);

// List of models that must be tenant-scoped
const TENANT_SCOPED_MODELS = new Set([
    'User', 'OPD_REG', 'appointments', 'Clinical_EHR', 'vital_signs',
    'triage_results', 'lab_orders', 'lab_test_inventory', 'lab_staff',
    'pharmacy_medicine_master', 'pharmacy_orders',
    'admissions', 'medical_notes', 'discharge_summaries',
    'beds', 'wards', 'invoices', 'invoice_items', 'payments', 'PaymentOrderIntent', 'billing_records', 'charge_catalog',
    'insurance_providers', 'insurance_policies', 'insurance_claims',
    'AiHealthAssessment', 'AppointmentSlot',
    // Phase 1 models
    'Department', 'PrescriptionTemplate', 'FollowUp',
    'LabSampleTracking', 'LabReagentInventory',
    'PharmacySupplier', 'PurchaseOrder', 'PharmacyPurchaseInvoice', 'PharmacyReturn',
    'BedTransfer', 'DietPlan', 'WardRound', 'NursingTask',
    'PatientFeedback',
    // Phase 2 models
    'CashClosure', 'Refund',
    // Phase 3 models
    'NursingNote', 'MedicationAdministration', 'ShiftHandover',
    'OPDConfig', 'Employee', 'Attendance',
    'LeaveType', 'LeaveRequest', 'ShiftPattern', 'ShiftAssignment',
    // Phase 4 models
    'Notification',
    // Security hardening models
    'user_mfa', 'PatientPasswordSetupToken',
    // Finance expense tracking models
    'ExpenseCategory', 'Vendor', 'Expense', 'TaxConfig',
    // Finance deposits, credit notes, fiscal, bank, dunning
    'PatientDeposit', 'CreditNote', 'FinancialPeriod', 'BankTransaction', 'DunningRule', 'DunningLog',
    // Branch management
    'Branch',
    // Admin panel dynamic configuration
    'ModuleConfig', 'Role', 'DocumentTemplate', 'AlertRule',
    // Data import & archival
    'DataImportJob', 'ArchivedPatientRecord',
    // Zealthix insurance integration
    'ZealthixApiKey',
    'PillReminder',
    'VideoCallRequest',
    // ER Module — only top-level models with organizationId
    'ERRegistration',
    // OT Module — only top-level models with organizationId
    'OTRoom', 'SurgeryMaster', 'SurgeryRequest', 'OTSchedule', 'SurgeryBilling',
    // CRM Module
    'CRMLead', 'CRMActivity', 'CRMCampaign', 'DoctorReferralNetwork', 'PatientEngagement',
    // IPD Enhancements
    'AdmissionBooking', 'PatientMovement', 'DischargeClearance',
    'PatientConsent_IPD', 'FinancialCounselling',
    // Billing Enhancements
    'DiscountOTP', 'BillingOrderSet', 'DiscountScheme',
    // Pharmacy Enhancements
    'NarcoticRegister',
    // OPD Enhancements
    'CounsellingSession', 'DoctorLeave', 'CallLog',
    // GAP models
    'NursingAssessmentAlert', 'ClinicalOrder', 'PhysicianOrder',
    'ActiveMedication', 'OrderSet', 'DoctorInvestigationFavorite',
    'ReferralOrder', 'ICD10Master',
    // IPD Finance
    'IpdServiceMaster', 'IpdTariffRate', 'IpdPackage', 'IpdAdmissionPackage',
    'IpdEstimate', 'IpdChargePosting',
    // Insurance
    'CorporateMaster', 'PreAuthorization', 'PaymentSplit',
    'InsurancePreAuth', 'AdmissionConsultant',
    // TPA & Insurance Upgrade (receivables)
    'InsuranceReceipt', 'InsuranceReceiptAllocation', 'ClaimDispatch',
    'DenialReason', 'ClaimShortPay', 'PayerSlaConfig',
    // Clinical
    'ClinicalEncounter', 'PatientAllergy',
    'IPDVitals', 'NursingAssessment',
    // GST & Finance
    'GST_Invoice_Register', 'GST_Return_Filing', 'HSN_SAC_Master',
    'GL_Account', 'GL_JournalEntry', 'GL_JournalLine', 'TallyExport',
    'TallyLedgerMapping', 'TallyVoucherMapping', 'TallySyncLog',
    'AssetCategory', 'FixedAsset', 'DepreciationEntry',
    'AssetTransfer', 'AssetMaintenance',
    'BudgetMaster', 'BudgetLine', 'BudgetRevision', 'BudgetAlert',
    'WardStock', 'WardStockTransaction',
    'GoodsReceiptNote',
    'MessageDeliveryLog', 'WhatsAppIncomingMessage',
    // Same class of gap as PharmacyPurchaseInvoice above: schema has organizationId
    // but the model was never registered here, so reads without an explicit manual
    // filter returned every org's rows. PharmacyInventoryMovement was confirmed
    // actively leaking (pharmacy movement ledger + COGS calc had no org filter at
    // all); invoice_snapshots' existing reads already filter manually and weren't
    // exploited, added here as defense-in-depth.
    'PharmacyInventoryMovement', 'invoice_snapshots',
]);

// Models where organizationId is nullable (audit logs, etc.)
const NULLABLE_ORG_MODELS = new Set([
    'system_audit_logs', 'lab_audit_logs', 'pharmacy_sales_audit',
]);

/**
 * Backfill who performed an audited action.
 *
 * 164 call sites across ~50 files write to system_audit_logs directly instead of
 * going through logAudit(), and roughly 63 of them never set user_id/username/role
 * — ADMIT_PATIENT_IPD and CREATE_PATIENT among them. Those rows stored a NULL user,
 * so the IPD trail's change log could only render them as "system", which reads as
 * "automated" when it actually means "nobody recorded it".
 *
 * Filling it here catches every existing call site and every future one, instead of
 * editing 63 files and hoping the 64th remembers. Anything the caller supplied wins,
 * so an explicit actor (impersonation, cron, dev portal) is never overwritten.
 *
 * getSession() is imported lazily: it pulls next/headers, which is unavailable in
 * plain node contexts (seed scripts, standalone tsx). It already swallows its own
 * errors and returns null, and this is wrapped again — audit enrichment must never
 * break the write it is decorating.
 */
async function withAuditActor(data: any): Promise<any> {
    if (!data || (data.user_id && data.username && data.role)) return data;
    try {
        const { getSession } = await import('@/app/lib/session');
        const session = await getSession();
        if (!session) return data;
        return {
            ...data,
            user_id: data.user_id ?? (session.id ? String(session.id) : undefined),
            username: data.username ?? (session.username || undefined),
            role: data.role ?? (session.role || undefined),
        };
    } catch {
        return data;
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getTenantPrisma(organizationId: string): any {
    return prisma.$extends({
        query: {
            $allModels: {
                async $allOperations({ operation, model, args, query }: any) {
                    if (model && (TENANT_SCOPED_MODELS.has(model) || NULLABLE_ORG_MODELS.has(model))) {
                        if (['findMany', 'findFirst', 'updateMany', 'deleteMany', 'count', 'aggregate', 'groupBy', 'findUnique'].includes(operation)) {
                            args.where = { ...args.where, organizationId };
                            // Auto-filter archived records unless explicitly querying for them
                            if (ARCHIVABLE_MODELS.has(model) && args.where?.is_archived === undefined) {
                                args.where.is_archived = false;
                            }
                        } else if (operation === 'create') {
                            args.data = { ...args.data, organizationId };
                            if (model === 'system_audit_logs') {
                                args.data = await withAuditActor(args.data);
                            }
                        } else if (operation === 'createMany' && args.data) {
                            if (Array.isArray(args.data)) {
                                args.data = args.data.map((d: any) => ({ ...d, organizationId }));
                            } else {
                                args.data = { ...args.data, organizationId };
                            }
                        }
                    }
                    return query(args);
                }
            },
        },
    });
}

// organizationId is auto-injected by $extends at runtime,
// but TypeScript still expects it in create() calls. Using `any` here
// so server actions don't need to pass organizationId explicitly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TenantPrismaClient = any;
