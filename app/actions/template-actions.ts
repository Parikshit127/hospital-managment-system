'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

const TEMPLATE_TYPES = ['prescription', 'invoice', 'discharge_summary', 'lab_report', 'consent_form', 'referral', 'medical_certificate'] as const;

const DEFAULT_TEMPLATES: Record<string, any> = {
    prescription: {
        sections: [
            { id: 'header', name: 'Hospital Header', enabled: true, fields: ['hospital_name', 'logo', 'address', 'phone'] },
            { id: 'patient', name: 'Patient Info', enabled: true, fields: ['patient_name', 'age', 'gender', 'uhid', 'date'] },
            { id: 'diagnosis', name: 'Diagnosis', enabled: true, fields: ['diagnosis', 'complaints'] },
            { id: 'medications', name: 'Medications', enabled: true, fields: ['drug_name', 'dosage', 'frequency', 'duration', 'instructions'] },
            { id: 'instructions', name: 'Instructions', enabled: true, fields: ['advice', 'diet', 'follow_up_date'] },
            { id: 'footer', name: 'Doctor Signature', enabled: true, fields: ['doctor_name', 'specialty', 'registration_no', 'signature'] },
        ],
        layout: { size: 'A4', orientation: 'portrait', margins: { top: 20, right: 15, bottom: 20, left: 15 } },
        variables: ['{{patient_name}}', '{{doctor_name}}', '{{date}}', '{{uhid}}', '{{diagnosis}}'],
    },
    invoice: {
        sections: [
            { id: 'header', name: 'Hospital Header', enabled: true, fields: ['hospital_name', 'logo', 'gst_no', 'address'] },
            { id: 'patient', name: 'Patient & Invoice Info', enabled: true, fields: ['patient_name', 'uhid', 'invoice_no', 'date', 'department'] },
            { id: 'items', name: 'Line Items', enabled: true, fields: ['description', 'quantity', 'rate', 'amount', 'tax'] },
            { id: 'totals', name: 'Totals', enabled: true, fields: ['subtotal', 'tax_amount', 'discount', 'net_amount'] },
            { id: 'payment', name: 'Payment Info', enabled: true, fields: ['payment_method', 'transaction_id', 'qr_code'] },
            { id: 'footer', name: 'Footer', enabled: true, fields: ['terms', 'footer_text'] },
        ],
        layout: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 10, bottom: 15, left: 10 } },
    },
    discharge_summary: {
        sections: [
            { id: 'header', name: 'Hospital Header', enabled: true, fields: ['hospital_name', 'logo'] },
            { id: 'patient', name: 'Patient Demographics', enabled: true, fields: ['name', 'age', 'gender', 'uhid', 'admission_date', 'discharge_date'] },
            { id: 'diagnosis', name: 'Diagnosis', enabled: true, fields: ['primary_diagnosis', 'secondary_diagnosis', 'icd_codes'] },
            { id: 'history', name: 'History & Examination', enabled: true, fields: ['presenting_complaints', 'past_history', 'examination_findings'] },
            { id: 'investigations', name: 'Investigations', enabled: true, fields: ['lab_results', 'imaging'] },
            { id: 'treatment', name: 'Treatment Given', enabled: true, fields: ['procedures', 'medications_during_stay'] },
            { id: 'discharge_meds', name: 'Discharge Medications', enabled: true, fields: ['medications', 'dosage', 'duration'] },
            { id: 'instructions', name: 'Instructions', enabled: true, fields: ['diet', 'activity', 'follow_up', 'warning_signs'] },
            { id: 'footer', name: 'Signatures', enabled: true, fields: ['treating_doctor', 'consultant', 'date'] },
        ],
        layout: { size: 'A4', orientation: 'portrait', margins: { top: 20, right: 15, bottom: 20, left: 15 } },
    },
    lab_report: {
        sections: [
            { id: 'header', name: 'Lab Header', enabled: true, fields: ['lab_name', 'logo', 'nabl_no'] },
            { id: 'patient', name: 'Patient Info', enabled: true, fields: ['name', 'age', 'gender', 'uhid', 'sample_date', 'report_date'] },
            { id: 'results', name: 'Test Results', enabled: true, fields: ['test_name', 'result', 'unit', 'reference_range', 'flag'] },
            { id: 'footer', name: 'Pathologist Signature', enabled: true, fields: ['pathologist_name', 'qualification', 'signature'] },
        ],
        layout: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 10, bottom: 15, left: 10 } },
    },
    consent_form: {
        sections: [
            { id: 'header', name: 'Hospital Header', enabled: true, fields: ['hospital_name', 'logo'] },
            { id: 'patient', name: 'Patient Info', enabled: true, fields: ['name', 'age', 'uhid'] },
            { id: 'procedure', name: 'Procedure Details', enabled: true, fields: ['procedure_name', 'description', 'risks', 'alternatives'] },
            { id: 'consent', name: 'Consent Text', enabled: true, fields: ['consent_statement', 'language'] },
            { id: 'signatures', name: 'Signatures', enabled: true, fields: ['patient_signature', 'witness_signature', 'doctor_signature', 'date'] },
        ],
        layout: { size: 'A4', orientation: 'portrait', margins: { top: 20, right: 15, bottom: 20, left: 15 } },
    },
    referral: {
        sections: [
            { id: 'header', name: 'Hospital Header', enabled: true, fields: ['hospital_name', 'logo'] },
            { id: 'from', name: 'Referring Doctor', enabled: true, fields: ['doctor_name', 'specialty', 'contact'] },
            { id: 'to', name: 'Referred To', enabled: true, fields: ['doctor_name', 'hospital', 'specialty'] },
            { id: 'patient', name: 'Patient Details', enabled: true, fields: ['name', 'age', 'gender', 'uhid'] },
            { id: 'clinical', name: 'Clinical Summary', enabled: true, fields: ['diagnosis', 'history', 'current_medications', 'reason_for_referral'] },
            { id: 'footer', name: 'Signature', enabled: true, fields: ['signature', 'date'] },
        ],
        layout: { size: 'A4', orientation: 'portrait', margins: { top: 20, right: 15, bottom: 20, left: 15 } },
    },
    medical_certificate: {
        sections: [
            { id: 'header', name: 'Hospital Header', enabled: true, fields: ['hospital_name', 'logo'] },
            { id: 'certificate', name: 'Certificate Details', enabled: true, fields: ['certificate_type', 'patient_name', 'age', 'diagnosis', 'period', 'remarks'] },
            { id: 'footer', name: 'Doctor Signature', enabled: true, fields: ['doctor_name', 'registration_no', 'signature', 'date', 'stamp'] },
        ],
        layout: { size: 'A4', orientation: 'portrait', margins: { top: 20, right: 15, bottom: 20, left: 15 } },
    },
};

export async function listTemplates(type?: string) {
    try {
        const { db } = await requireTenantContext();
        const where: any = {};
        if (type) where.type = type;

        const templates = await db.documentTemplate.findMany({
            where,
            orderBy: [{ type: 'asc' }, { is_default: 'desc' }, { name: 'asc' }],
        });

        return { success: true, data: templates };
    } catch (error: any) {
        console.error('listTemplates error:', error);
        return { success: false, error: error.message };
    }
}

export async function getTemplate(templateId: string) {
    try {
        const { db } = await requireTenantContext();
        const template = await db.documentTemplate.findFirst({
            where: { id: templateId },
        });
        if (!template) return { success: false, error: 'Template not found' };
        return { success: true, data: template };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function createTemplate(data: {
    type: string;
    name: string;
    content_json?: any;
    is_default?: boolean;
}) {
    try {
        const { db, organizationId, session } = await requireTenantContext();

        const contentJson = data.content_json || DEFAULT_TEMPLATES[data.type] || {};

        if (data.is_default) {
            await db.documentTemplate.updateMany({
                where: { type: data.type },
                data: { is_default: false },
            });
        }

        const template = await db.documentTemplate.create({
            data: {
                organizationId,
                type: data.type,
                name: data.name,
                content_json: contentJson,
                is_default: data.is_default || false,
                created_by: session.id,
            },
        });

        await db.system_audit_logs.create({
            data: {
                user_id: session.id,
                username: session.username,
                role: session.role,
                action: 'CREATE_TEMPLATE',
                module: 'admin',
                entity_type: 'DocumentTemplate',
                entity_id: template.id,
                details: `Created ${data.type} template: ${data.name}`,
                organizationId,
            },
        });

        revalidatePath('/admin/templates');
        return { success: true, data: template };
    } catch (error: any) {
        console.error('createTemplate error:', error);
        return { success: false, error: error.message };
    }
}

export async function updateTemplate(templateId: string, data: {
    name?: string;
    content_json?: any;
    is_default?: boolean;
    is_active?: boolean;
}) {
    try {
        const { db, organizationId, session } = await requireTenantContext();

        if (data.is_default) {
            const existing = await db.documentTemplate.findFirst({ where: { id: templateId } });
            if (existing) {
                await db.documentTemplate.updateMany({
                    where: { type: existing.type, id: { not: templateId } },
                    data: { is_default: false },
                });
            }
        }

        const template = await db.documentTemplate.update({
            where: { id: templateId },
            data,
        });

        await db.system_audit_logs.create({
            data: {
                user_id: session.id,
                username: session.username,
                role: session.role,
                action: 'UPDATE_TEMPLATE',
                module: 'admin',
                entity_type: 'DocumentTemplate',
                entity_id: templateId,
                details: `Updated template: ${template.name}`,
                organizationId,
            },
        });

        revalidatePath('/admin/templates');
        return { success: true, data: template };
    } catch (error: any) {
        console.error('updateTemplate error:', error);
        return { success: false, error: error.message };
    }
}

export async function deleteTemplate(templateId: string) {
    try {
        const { db, organizationId, session } = await requireTenantContext();

        const template = await db.documentTemplate.findFirst({ where: { id: templateId } });
        if (!template) return { success: false, error: 'Template not found' };
        if (template.is_default) return { success: false, error: 'Cannot delete the default template' };

        await db.documentTemplate.delete({ where: { id: templateId } });

        await db.system_audit_logs.create({
            data: {
                user_id: session.id,
                username: session.username,
                role: session.role,
                action: 'DELETE_TEMPLATE',
                module: 'admin',
                entity_type: 'DocumentTemplate',
                entity_id: templateId,
                details: `Deleted template: ${template.name}`,
                organizationId,
            },
        });

        revalidatePath('/admin/templates');
        return { success: true };
    } catch (error: any) {
        console.error('deleteTemplate error:', error);
        return { success: false, error: error.message };
    }
}

export async function cloneTemplate(templateId: string, newName: string) {
    try {
        const { db, organizationId, session } = await requireTenantContext();

        const source = await db.documentTemplate.findFirst({ where: { id: templateId } });
        if (!source) return { success: false, error: 'Source template not found' };

        const template = await db.documentTemplate.create({
            data: {
                organizationId,
                type: source.type,
                name: newName,
                content_json: source.content_json,
                is_default: false,
                created_by: session.id,
            },
        });

        await db.system_audit_logs.create({
            data: {
                user_id: session.id,
                username: session.username,
                role: session.role,
                action: 'CLONE_TEMPLATE',
                module: 'admin',
                entity_type: 'DocumentTemplate',
                entity_id: template.id,
                details: `Cloned template: ${source.name} as ${newName}`,
                organizationId,
            },
        });

        revalidatePath('/admin/templates');
        return { success: true, data: template };
    } catch (error: any) {
        console.error('cloneTemplate error:', error);
        return { success: false, error: error.message };
    }
}

export async function getDefaultTemplate(type: string) {
    return DEFAULT_TEMPLATES[type] || {};
}

export async function getTemplateTypes() {
    return TEMPLATE_TYPES.map(t => ({
        key: t,
        label: t.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    }));
}
