import { PrismaClient } from '@prisma/client';
import { validateServerEnv } from '@/app/lib/env';

validateServerEnv();

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

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
    'PharmacySupplier', 'PurchaseOrder', 'PharmacyReturn',
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
]);

// Models where organizationId is nullable (audit logs, etc.)
const NULLABLE_ORG_MODELS = new Set([
    'system_audit_logs', 'lab_audit_logs', 'pharmacy_sales_audit',
]);

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
