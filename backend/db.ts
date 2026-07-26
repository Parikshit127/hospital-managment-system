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
    // Every remaining model that declares a non-null organizationId. These were
    // never registered, so a read without a hand-written organizationId filter
    // returned rows from every hospital on the deployment. Registering them makes
    // isolation the default instead of something each call site must remember;
    // call sites that already filter manually are unaffected (same predicate twice).
    // EmailJob is deliberately excluded — its organizationId is nullable, so a
    // strict equality would hide unscoped system mail from the dispatcher.
    'OrganizationConfig', 'OrganizationBranding', 'PatientNote', 'LabPanel',
    'radiology_imaging', 'ReleaseNote', 'Broadcast', 'NotificationReceipt',
    'Ticket', 'TicketNote', 'PatientConsent', 'PasswordResetOTP',
    'IpdPackageTpaRate', 'patient_external_records', 'Writeoff',
    'AppointmentWaitlist', 'RegistrationFieldConfig', 'DispenseAllocation',
    'Referrer', 'ReferrerServiceRate', 'ReferralCommission', 'ReferralPayoutStatement',
    'DoctorCommissionConfig', 'DoctorServiceRate', 'DoctorCommission', 'DoctorPayoutStatement',
    'ambulance_requests', 'indents', 'inventory_movements', 'item_batches',
    'item_categories', 'item_master', 'item_vendors',
    'mis_daily_billing_rollups', 'mis_daily_pharmacy_rollups',
    'optical_orders', 'optical_prescriptions', 'purchase_requisitions',
    'report_access_logs', 'report_jobs', 'report_presets', 'report_schedules',
    'stock_adjustments', 'stock_count_sessions', 'stock_issues', 'stock_transfers',
    'store_item_settings', 'store_stocks', 'stores',
    // Nursing care-record models. These were added without being registered
    // here, which is the same mistake this list exists to prevent: most of
    // their reads filter only on admission_id, and getIncidents filtered on
    // nothing but status — so the incident list showed every hospital's
    // incidents, and the shift board keyed on ward_id, which is an integer that
    // collides across organizations (ward 3 exists in both). Registering them
    // makes isolation automatic rather than something each query must remember.
    'NursingCarePlan', 'FluidBalanceEntry', 'WoundCareRecord', 'PatientDevice',
    'TransfusionRecord', 'ClinicalIncident', 'PatientEducationRecord',
    'NurseShiftAssignment', 'NEWSEscalation',
]);

// Models where organizationId is nullable (audit logs, etc.)
const NULLABLE_ORG_MODELS = new Set([
    'system_audit_logs', 'lab_audit_logs', 'pharmacy_sales_audit',
]);

// Extended clients, one per organization.
//
// $extends builds a new client instance on every call, and getTenantPrisma() is
// called on every requireTenantContext() — several times per request once
// actions call other actions. The extension only closes over organizationId, so
// one instance per org is safe to reuse. Cached on globalThis for the same
// reason the base client is: Next can re-evaluate this module more than once
// per server process.
//
// Measured honestly: construction is cheap (1000 calls complete in under a
// millisecond), so this is tidiness and allocation pressure rather than a fix
// for anything slow. The IPD dashboard's latency was investigated here and does
// NOT come from this path — see the note on getIPDDashboardBundle.
const globalForTenants = globalThis as unknown as { tenantClients?: Map<string, any> };
const tenantClients: Map<string, any> = globalForTenants.tenantClients ?? new Map();
if (isServer) globalForTenants.tenantClients = tenantClients;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getTenantPrisma(organizationId: string): any {
    const cached = tenantClients.get(organizationId);
    if (cached) return cached;
    const client = buildTenantPrisma(organizationId);
    tenantClients.set(organizationId, client);
    return client;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildTenantPrisma(organizationId: string): any {
    return prisma.$extends({
        query: {
            $allModels: {
                async $allOperations({ operation, model, args, query }: any) {
                    if (model && (TENANT_SCOPED_MODELS.has(model) || NULLABLE_ORG_MODELS.has(model))) {
                        // `update`, `delete` and `upsert` MUST be scoped too. Without them a
                        // single-record mutation addressed by primary key crossed tenants:
                        // ids are global autoincrement integers, so administerMedication(7)
                        // from one hospital updated another hospital's row. Prisma 5+ allows
                        // non-unique fields alongside a unique one in these where clauses,
                        // so injecting organizationId here simply makes a foreign row miss.
                        if (['findMany', 'findFirst', 'updateMany', 'deleteMany', 'count', 'aggregate', 'groupBy', 'findUnique', 'update', 'delete', 'upsert'].includes(operation)) {
                            args.where = { ...args.where, organizationId };
                            // Auto-filter archived records unless explicitly querying for them
                            if (ARCHIVABLE_MODELS.has(model) && args.where?.is_archived === undefined) {
                                args.where.is_archived = false;
                            }
                        }
                        // upsert also carries a create payload that needs the org stamped
                        if (operation === 'upsert' && args.create) {
                            args.create = { ...args.create, organizationId };
                        }
                        if (operation === 'create') {
                            args.data = { ...args.data, organizationId };
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
