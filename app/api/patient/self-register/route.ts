import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { getTenantPrisma } from '@/backend/db';
import { createPatientPasswordSetupToken } from '@/app/lib/password-setup';
import { sendWelcomeEmail } from '@/backend/email';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { org_slug, full_name, phone, email, age, gender, date_of_birth,
            address, blood_group, department, emergency_contact_name, emergency_contact_phone } = body;

        if (!org_slug || !full_name?.trim() || !phone?.trim()) {
            return NextResponse.json({ success: false, error: 'Name, phone and organisation are required' }, { status: 400 });
        }

        // Find org
        const org = await prisma.organization.findUnique({
            where: { slug: org_slug },
            select: { id: true, name: true, is_active: true },
        });
        if (!org || !org.is_active) {
            return NextResponse.json({ success: false, error: 'Organisation not found' }, { status: 404 });
        }

        const db = getTenantPrisma(org.id);

        // Check duplicate phone
        const existing = await (db.oPD_REG.findFirst as any)({
            where: { phone: { contains: phone.slice(-10) }, organizationId: org.id },
            select: { patient_id: true },
        });
        if (existing) {
            return NextResponse.json({ success: false, error: 'A patient with this phone number already exists. Please login.' }, { status: 409 });
        }

        // Generate UHID
        const year = new Date().getFullYear();
        const orgConfig = await prisma.organizationConfig.findUnique({
            where: { organizationId: org.id },
            select: { uhid_prefix: true },
        });
        const prefix = orgConfig?.uhid_prefix || 'AVN';
        const yearPrefix = `${prefix}-${year}-`;

        const last = await (db.oPD_REG.findFirst as any)({
            where: { patient_id: { startsWith: yearPrefix } },
            orderBy: { patient_id: 'desc' },
            select: { patient_id: true },
        });

        let nextSeq = 1;
        if (last?.patient_id) {
            const parts = last.patient_id.split('-');
            const lastSeq = parseInt(parts[parts.length - 1], 10);
            if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
        }
        const patientId = `${yearPrefix}${String(nextSeq).padStart(5, '0')}`;

        // Create patient
        await (db.oPD_REG.create as any)({
            data: {
                patient_id: patientId,
                full_name: full_name.trim(),
                phone: phone.trim(),
                email: email?.trim() || 'not given',
                age: age ? String(age) : null,
                gender: gender || 'Male',
                date_of_birth: date_of_birth || null,
                address: address?.trim() || 'Self-registered',
                blood_group: blood_group || null,
                department: department || 'General',
                emergency_contact_name: emergency_contact_name || null,
                emergency_contact_phone: emergency_contact_phone || null,
                registration_consent: true,
                organizationId: org.id,
                patient_type: 'cash',
                is_senior_citizen: age ? parseInt(age) > 60 : false,
            },
        });

        // Create password setup token
        const tokenResult = await createPatientPasswordSetupToken({
            patientId,
            organizationId: org.id,
        });

        // Send welcome email (non-blocking)
        if (email && email !== 'not given') {
            sendWelcomeEmail(email, full_name, patientId, tokenResult.setupLink)
                .catch(err => console.error('[Self-Register Email]', err));
        }

        return NextResponse.json({
            success: true,
            patient_id: patientId,
            setup_link: tokenResult.setupLink,
        });
    } catch (error: any) {
        console.error('Self-register error:', error);
        return NextResponse.json({ success: false, error: error.message || 'Registration failed' }, { status: 500 });
    }
}
