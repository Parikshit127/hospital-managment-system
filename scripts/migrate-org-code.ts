/**
 * HospitalOS — Organization Code Migration Script
 * 
 * Safely updates an organization's code across all database tables:
 *  - organizations.code & organization_configs.uhid_prefix
 *  - OPD_REG.patient_id (cascades via ON UPDATE CASCADE to admissions, appointments, invoices, etc.)
 *  - Plain-string patient_id references (Clinical_EHR, lab_orders, pharmacy_orders, etc.)
 *  - admissions.admission_id (cascades to 21 FK tables)
 *  - Plain-string admission_id references (ipd_charge_postings, etc.)
 *  - invoices.invoice_number & invoices.final_bill_number
 *  - payments.receipt_number
 *  - patient_deposits.deposit_number, credit_notes, insurance_receipts, indents, payout statements
 *  - system_audit_logs entity_id & details
 *
 * Usage:
 *   npx tsx scripts/migrate-org-code.ts <orgId_or_slug> <oldCode> <newCode> [--dry-run]
 *
 * Examples:
 *   # Dry run on local/demo DB:
 *   npx tsx scripts/migrate-org-code.ts 81a91fdc-2c55-4bf0-b942-5623f4de6550 AXTE ANH --dry-run
 *
 *   # Real run on local/demo DB:
 *   npx tsx scripts/migrate-org-code.ts 81a91fdc-2c55-4bf0-b942-5623f4de6550 AXTE ANH
 *
 *   # Real run on AWS RDS DB:
 *   DATABASE_URL="postgresql://user:pass@your-rds-host:5432/dbname" npx tsx scripts/migrate-org-code.ts 81a91fdc-2c55-4bf0-b942-5623f4de6550 AXTE ANH
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function migrateOrganizationCode(
    orgIdentifier: string,
    oldCode: string,
    newCode: string,
    dryRun: boolean = false
) {
    if (!orgIdentifier || !oldCode || !newCode) {
        throw new Error('Usage: migrateOrganizationCode(orgIdentifier, oldCode, newCode, dryRun?)');
    }

    const cleanOld = oldCode.trim().toUpperCase();
    const cleanNew = newCode.trim().toUpperCase();

    if (cleanOld === cleanNew) {
        throw new Error(`Old code and new code are identical (${cleanOld}). Nothing to migrate.`);
    }

    console.log(`\n==================================================`);
    console.log(` HospitalOS — Organization Code Migration`);
    console.log(` Mode:        ${dryRun ? 'DRY RUN (Preview only, no changes saved)' : 'LIVE EXECUTION (Changes will be committed)'}`);
    console.log(` Target Org:  ${orgIdentifier}`);
    console.log(` Migration:   ${cleanOld}  ===>  ${cleanNew}`);
    console.log(`==================================================\n`);

    // 1. Resolve Organization
    const org = await prisma.organization.findFirst({
        where: {
            OR: [
                { id: orgIdentifier },
                { slug: orgIdentifier },
                { code: cleanOld },
                { code: cleanNew },
            ],
        },
        include: {
            config: true,
        },
    });

    if (!org) {
        throw new Error(`Organization matching "${orgIdentifier}" or code "${cleanOld}" / "${cleanNew}" not found.`);
    }

    console.log(`Found organization: "${org.name}" (ID: ${org.id}, current code: ${org.code}, slug: ${org.slug})\n`);

    // 2. Perform Migration inside an atomic transaction
    const results: Record<string, number> = {};

    await prisma.$transaction(async (tx) => {
        // Query information_schema once to discover exact table names and available columns
        const schemaColumns = await tx.$queryRawUnsafe<Array<{ table_name: string; column_name: string }>>(`
            SELECT table_name, column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public';
        `);

        const findTableCol = (targetTable: string, targetCol: string) => {
            const match = schemaColumns.find(
                c => c.table_name.toLowerCase() === targetTable.toLowerCase() &&
                     c.column_name.toLowerCase() === targetCol.toLowerCase()
            );
            if (!match) return null;
            const hasOrgId = schemaColumns.some(
                c => c.table_name === match.table_name && c.column_name === 'organizationId'
            );
            return {
                exactTable: match.table_name,
                exactCol: match.column_name,
                hasOrgId,
            };
        };

        // Helper to execute an UPDATE query and record affected row count
        const runUpdate = async (label: string, query: string): Promise<number> => {
            try {
                const count = await tx.$executeRawUnsafe(query);
                results[label] = count;
                return count;
            } catch (err: any) {
                console.error(`Error during update for "${label}":`, err.message);
                throw err;
            }
        };

        console.log(`1. Updating Organization core tables...`);
        // Update organizations.code
        await runUpdate(
            'organizations.code',
            `UPDATE organizations SET code = '${cleanNew}', updated_at = NOW() WHERE id = '${org.id}';`
        );

        // Update organization_configs.uhid_prefix
        await runUpdate(
            'organization_configs.uhid_prefix',
            `UPDATE organization_configs SET uhid_prefix = '${cleanNew}' WHERE "organizationId" = '${org.id}';`
        );

        console.log(`2. Updating Admissions (admission_id)...`);
        // Update admissions.admission_id (will cascade to 21 FK tables)
        await runUpdate(
            'admissions.admission_id (cascades to FK tables)',
            `UPDATE admissions 
             SET admission_id = regexp_replace(admission_id, '^${cleanOld}-ADM-', '${cleanNew}-ADM-')
             WHERE "organizationId" = '${org.id}' AND admission_id LIKE '${cleanOld}-ADM-%';`
        );

        // Update plain-string admission_id references
        const admissionPlainCandidates = [
            'ipd_charge_postings',
            'pharmacy_orders',
            'nursing_notes',
            'medication_administrations',
            'patient_deposits',
            'nursing_assessment_alerts',
            'clinical_orders',
            'physician_orders',
            'active_medications',
            'referral_orders',
            'surgery_requests',
            'er_registrations',
            'PatientMovement',
            'DischargeClearance',
            'PatientConsent_IPD',
        ];

        for (const cand of admissionPlainCandidates) {
            const meta = findTableCol(cand, 'admission_id');
            if (!meta) continue;
            const orgFilter = meta.hasOrgId ? `"organizationId" = '${org.id}' AND ` : '';
            await runUpdate(
                `${meta.exactTable}.${meta.exactCol} (plain-string)`,
                `UPDATE "${meta.exactTable}"
                 SET "${meta.exactCol}" = regexp_replace("${meta.exactCol}", '^${cleanOld}-ADM-', '${cleanNew}-ADM-')
                 WHERE ${orgFilter}"${meta.exactCol}" LIKE '${cleanOld}-ADM-%';`
            );
        }

        console.log(`3. Updating Patients (OPD_REG.patient_id)...`);
        // Update OPD_REG.patient_id (cascades via Postgres FK to admissions, appointments, invoices, etc.)
        await runUpdate(
            'OPD_REG.patient_id (cascades to FK tables)',
            `UPDATE "OPD_REG"
             SET patient_id = regexp_replace(patient_id, '^${cleanOld}-', '${cleanNew}-')
             WHERE "organizationId" = '${org.id}' AND patient_id LIKE '${cleanOld}-%';`
        );

        // Update plain-string patient_id references (non-FK tables)
        const patientPlainCandidates = [
            'Clinical_EHR',
            'lab_orders',
            'pharmacy_orders',
            'vital_signs',
            'ipd_vitals',
            'patient_deposits',
            'indents',
            'nursing_assessment_alerts',
            'clinical_orders',
            'physician_orders',
            'active_medications',
            'referral_orders',
            'patient_external_records',
            'insurance_preauths',
            'surgery_requests',
            'er_registrations',
            'writeoffs',
            'crm_leads',
            'CRMLead',
            'patient_engagements',
            'PatientEngagement',
            'appointment_waitlists',
            'AppointmentWaitlist',
            'AdmissionBooking',
            'PatientMovement',
            'CounsellingSession',
            'FinancialCounselling',
            'referral_commissions',
            'doctor_commissions',
            'ambulance_requests',
            'inventory_movements',
            'optical_orders',
            'optical_prescriptions',
            'follow_ups',
            'patient_consents',
            'password_reset_otps',
            'dunning_logs',
            'ipd_estimates',
            'triage_results',
            'ai_health_assessments',
            'NarcoticRegister',
            'nursing_notes',
        ];

        for (const cand of patientPlainCandidates) {
            const meta = findTableCol(cand, 'patient_id');
            if (!meta) continue;
            const orgFilter = meta.hasOrgId ? `"organizationId" = '${org.id}' AND ` : '';
            await runUpdate(
                `${meta.exactTable}.${meta.exactCol} (plain-string)`,
                `UPDATE "${meta.exactTable}"
                 SET "${meta.exactCol}" = regexp_replace("${meta.exactCol}", '^${cleanOld}-', '${cleanNew}-')
                 WHERE ${orgFilter}"${meta.exactCol}" LIKE '${cleanOld}-%';`
            );
        }

        console.log(`4. Updating Invoices & Bills...`);
        // Update invoices.invoice_number
        await runUpdate(
            'invoices.invoice_number',
            `UPDATE invoices
             SET invoice_number = regexp_replace(invoice_number, '^${cleanOld}-', '${cleanNew}-')
             WHERE "organizationId" = '${org.id}' AND invoice_number LIKE '${cleanOld}-%';`
        );

        // Update invoices.final_bill_number
        await runUpdate(
            'invoices.final_bill_number',
            `UPDATE invoices
             SET final_bill_number = regexp_replace(final_bill_number, '^${cleanOld}-BILL-', '${cleanNew}-BILL-')
             WHERE "organizationId" = '${org.id}' AND final_bill_number LIKE '${cleanOld}-BILL-%';`
        );

        console.log(`5. Updating Payments, Receipts, Deposits & Indents...`);
        // Update payments.receipt_number
        const payMeta = findTableCol('payments', 'receipt_number');
        if (payMeta) {
            await runUpdate(
                'payments.receipt_number',
                `UPDATE "${payMeta.exactTable}"
                 SET "${payMeta.exactCol}" = regexp_replace("${payMeta.exactCol}", '^${cleanOld}-RCP-', '${cleanNew}-RCP-')
                 WHERE "organizationId" = '${org.id}' AND "${payMeta.exactCol}" LIKE '${cleanOld}-RCP-%';`
            );
        }

        // Update patient_deposits.deposit_number
        const depMeta = findTableCol('patient_deposits', 'deposit_number');
        if (depMeta) {
            await runUpdate(
                'patient_deposits.deposit_number',
                `UPDATE "${depMeta.exactTable}"
                 SET "${depMeta.exactCol}" = regexp_replace("${depMeta.exactCol}", '^${cleanOld}-DEP-', '${cleanNew}-DEP-')
                 WHERE "organizationId" = '${org.id}' AND "${depMeta.exactCol}" LIKE '${cleanOld}-DEP-%';`
            );
        }

        // Update credit_notes.credit_note_number
        const cnMeta = findTableCol('credit_notes', 'credit_note_number');
        if (cnMeta) {
            await runUpdate(
                'credit_notes.credit_note_number',
                `UPDATE "${cnMeta.exactTable}"
                 SET "${cnMeta.exactCol}" = regexp_replace("${cnMeta.exactCol}", '^${cleanOld}-CN-', '${cleanNew}-CN-')
                 WHERE "organizationId" = '${org.id}' AND "${cnMeta.exactCol}" LIKE '${cleanOld}-CN-%';`
            );
        }

        // Update insurance_receipts.receipt_number
        const ircMeta = findTableCol('insurance_receipts', 'receipt_number');
        if (ircMeta) {
            await runUpdate(
                'insurance_receipts.receipt_number',
                `UPDATE "${ircMeta.exactTable}"
                 SET "${ircMeta.exactCol}" = regexp_replace("${ircMeta.exactCol}", '^${cleanOld}-IRC-', '${cleanNew}-IRC-')
                 WHERE "organizationId" = '${org.id}' AND "${ircMeta.exactCol}" LIKE '${cleanOld}-IRC-%';`
            );
        }

        // Update pharmacy_orders.indent_number
        const phmMeta = findTableCol('pharmacy_orders', 'indent_number');
        if (phmMeta) {
            await runUpdate(
                'pharmacy_orders.indent_number',
                `UPDATE "${phmMeta.exactTable}"
                 SET "${phmMeta.exactCol}" = regexp_replace("${phmMeta.exactCol}", '^${cleanOld}-IND-', '${cleanNew}-IND-')
                 WHERE "organizationId" = '${org.id}' AND "${phmMeta.exactCol}" LIKE '${cleanOld}-IND-%';`
            );
        }

        // Update indents.indent_number
        const indMeta = findTableCol('indents', 'indent_number');
        if (indMeta) {
            await runUpdate(
                'indents.indent_number',
                `UPDATE "${indMeta.exactTable}"
                 SET "${indMeta.exactCol}" = regexp_replace("${indMeta.exactCol}", '^${cleanOld}-IND-', '${cleanNew}-IND-')
                 WHERE "organizationId" = '${org.id}' AND "${indMeta.exactCol}" LIKE '${cleanOld}-IND-%';`
            );
        }

        // Update referral_payout_statements.statement_number
        const rpsMeta = findTableCol('referral_payout_statements', 'statement_number');
        if (rpsMeta) {
            await runUpdate(
                'referral_payout_statements.statement_number',
                `UPDATE "${rpsMeta.exactTable}"
                 SET "${rpsMeta.exactCol}" = regexp_replace("${rpsMeta.exactCol}", '^${cleanOld}-CNI-', '${cleanNew}-CNI-')
                 WHERE "organizationId" = '${org.id}' AND "${rpsMeta.exactCol}" LIKE '${cleanOld}-CNI-%';`
            );
        }

        // Update doctor_payout_statements.statement_number
        const dpsMeta = findTableCol('doctor_payout_statements', 'statement_number');
        if (dpsMeta) {
            await runUpdate(
                'doctor_payout_statements.statement_number',
                `UPDATE "${dpsMeta.exactTable}"
                 SET "${dpsMeta.exactCol}" = regexp_replace("${dpsMeta.exactCol}", '^${cleanOld}-DRI-', '${cleanNew}-DRI-')
                 WHERE "organizationId" = '${org.id}' AND "${dpsMeta.exactCol}" LIKE '${cleanOld}-DRI-%';`
            );
        }

        console.log(`6. Updating System Audit Logs...`);
        // Update system_audit_logs.entity_id
        await runUpdate(
            'system_audit_logs.entity_id',
            `UPDATE system_audit_logs
             SET entity_id = regexp_replace(entity_id, '^${cleanOld}-', '${cleanNew}-')
             WHERE entity_id LIKE '${cleanOld}-%';`
        );

        // Update system_audit_logs.details
        await runUpdate(
            'system_audit_logs.details',
            `UPDATE system_audit_logs
             SET details = replace(details, '"${cleanOld}-', '"${cleanNew}-')
             WHERE details LIKE '%"${cleanOld}-%';`
        );

        // Record migration in system_audit_logs if not dry run
        if (!dryRun) {
            await tx.system_audit_logs.create({
                data: {
                    action: 'MIGRATE_ORGANIZATION_CODE',
                    module: 'superadmin',
                    entity_type: 'organization',
                    entity_id: org.id,
                    username: 'cli_migration',
                    role: 'superadmin',
                    details: JSON.stringify({
                        old_code: cleanOld,
                        new_code: cleanNew,
                        summary: results,
                    }),
                },
            });
        }

        if (dryRun) {
            throw new Error('__DRY_RUN_ROLLBACK__');
        }
    }, {
        maxWait: 20000,
        timeout: 60000,
    }).catch((err) => {
        if (err.message === '__DRY_RUN_ROLLBACK__') {
            console.log('\n[Dry Run] All updates simulated successfully. Transaction rolled back safely.');
            return;
        }
        throw err;
    });

    // 3. Print Summary Report
    console.log(`\n==================================================`);
    console.log(` Migration Summary Report (${dryRun ? 'DRY RUN' : 'COMMITTED'})`);
    console.log(`==================================================`);

    let totalUpdated = 0;
    for (const [key, count] of Object.entries(results)) {
        if (count > 0) {
            console.log(` - ${key.padEnd(45)}: ${count} row(s)`);
            totalUpdated += count;
        }
    }

    console.log(`--------------------------------------------------`);
    console.log(` Total modified rows across all tables: ${totalUpdated}`);
    console.log(`==================================================\n`);

    return {
        organizationId: org.id,
        oldCode: cleanOld,
        newCode: cleanNew,
        dryRun,
        counts: results,
    };
}

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const filteredArgs = args.filter(a => a !== '--dry-run');

    const orgIdentifier = filteredArgs[0] || '81a91fdc-2c55-4bf0-b942-5623f4de6550';
    const oldCode = filteredArgs[1] || 'AXTE';
    const newCode = filteredArgs[2] || 'ANH';

    try {
        await migrateOrganizationCode(orgIdentifier, oldCode, newCode, dryRun);
    } catch (err: any) {
        console.error('\n[Migration Error]:', err.message);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    main();
}
