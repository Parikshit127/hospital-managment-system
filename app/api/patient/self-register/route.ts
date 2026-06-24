import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { prisma } from '@/backend/db';
import { getTenantPrisma } from '@/backend/db';
import { createPatientPasswordSetupToken } from '@/app/lib/password-setup';
import { sendWelcomeEmail } from '@/backend/email';
import { createPatientSession } from '@/app/lib/session';

/**
 * Generate a secure random password that satisfies the patient portal password
 * policy (uppercase + lowercase + digit + special char). Ambiguous characters
 * (O/0, l/1) are excluded so the on-screen credential is easy to read & type.
 */
function generateSecurePassword(): string {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnpqrstuvwxyz';
    const digits = '23456789';
    const special = '@#$%&*!?';
    const all = upper + lower + digits + special;
    const pick = (set: string) => set[crypto.randomInt(set.length)];

    // Guarantee at least one of each required class, then fill to length 14.
    const chars = [pick(upper), pick(lower), pick(digits), pick(special)];
    for (let i = 0; i < 10; i++) chars.push(pick(all));

    // Fisher–Yates shuffle so the guaranteed characters aren't positionally predictable.
    for (let i = chars.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { org_slug, full_name, phone, email, age, gender, date_of_birth,
            address, blood_group, emergency_contact_name, emergency_contact_phone } = body;

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

        // Auto-generate a secure password so the patient is logged in immediately
        // (frictionless flow — no manual setup-password step required).
        const generatedPassword = generateSecurePassword();
        const passwordHash = await bcrypt.hash(generatedPassword, 12);

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
                password: passwordHash,
                emergency_contact_name: emergency_contact_name || null,
                emergency_contact_phone: emergency_contact_phone || null,
                registration_consent: true,
                organizationId: org.id,
                patient_type: 'cash',
                is_senior_citizen: age ? parseInt(age) > 60 : false,
            },
        });

        // Create password setup token — used ONLY for the optional "set/change
        // your password" link in the welcome email. The plaintext password is
        // never emailed; it is shown on-screen once for the patient to copy.
        const tokenResult = await createPatientPasswordSetupToken({
            patientId,
            organizationId: org.id,
        });

        // Send welcome email: Patient ID + change-password link only.
        // Awaited (not fire-and-forget) so it actually dispatches before the
        // serverless function freezes; failure is non-fatal to registration.
        if (email && email !== 'not given') {
            try {
                await sendWelcomeEmail(email, full_name, patientId, tokenResult.setupLink, org.id, org.name);
            } catch (err) {
                console.error('[Self-Register Email] Failed to send welcome email:', err);
            }
        }

        // Silently authenticate the patient by issuing the session cookie now,
        // bypassing the setup-password screen.
        await createPatientSession({
            id: patientId,
            name: full_name.trim(),
            phone: phone.trim(),
            role: 'patient',
            organization_id: org.id,
            organization_name: org.name,
        });

        return NextResponse.json({
            success: true,
            patient_id: patientId,
            password: generatedPassword,
            setup_link: tokenResult.setupLink,
            auto_login: true,
        });
    } catch (error: any) {
        console.error('Self-register error:', error);
        return NextResponse.json({ success: false, error: error.message || 'Registration failed' }, { status: 500 });
    }
}
