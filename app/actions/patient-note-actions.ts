'use server';

import { guardAction } from '@/app/lib/action-guard';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';

export type PatientNoteDTO = {
    id: number;
    note: string;
    source: string | null;
    created_by: string | null;
    created_by_name: string | null;
    created_by_role: string | null;
    created_at: string;
};

type AddResult =
    | { success: true; data: PatientNoteDTO }
    | { success: false; error: string };

type ListResult =
    | { success: true; data: PatientNoteDTO[] }
    | { success: false; error: string };

type PatientNoteRow = {
    id: number;
    note: string;
    source: string | null;
    created_by: string | null;
    created_by_name: string | null;
    created_by_role: string | null;
    created_at: Date;
};

const MAX_NOTE_LENGTH = 2000;

/**
 * Add a free-text note to a patient. The author is taken from the session
 * (never the client). Patients cannot write notes on records.
 */
export async function addPatientNote(
    patientId: string,
    note: string,
    source: 'admission' | 'registration' | 'profile' = 'profile',
): Promise<AddResult> {
    const __denied = await guardAction('patient-note-actions', 'addPatientNote');
    if (__denied) return __denied;
    try {
        const { db, session, organizationId } = await requireTenantContext();
        if (!session || session.role === 'patient') {
            return { success: false, error: 'Not authorized to add notes' };
        }

        const trimmed = (note || '').trim();
        if (!trimmed) return { success: false, error: 'Note cannot be empty' };
        if (trimmed.length > MAX_NOTE_LENGTH) {
            return { success: false, error: `Note must be ${MAX_NOTE_LENGTH} characters or fewer` };
        }

        // Ensure the patient belongs to this organization before attaching a note.
        const patient = await db.oPD_REG.findFirst({
            where: { patient_id: patientId, organizationId },
            select: { patient_id: true },
        });
        if (!patient) return { success: false, error: 'Patient not found' };

        const created = await db.patientNote.create({
            data: {
                patient_id: patientId,
                note: trimmed,
                source,
                created_by: session.username ?? null,
                created_by_name: session.name ?? null,
                created_by_role: session.role ?? null,
                organizationId,
            },
        });

        // Refresh profile pages that render notes.
        revalidatePath(`/reception/patient/${patientId}`);
        revalidatePath(`/admin/patients/${patientId}`);
        revalidatePath(`/doctor/patient/${patientId}`);
        revalidatePath(`/billing/patient/${patientId}`);

        return {
            success: true,
            data: {
                id: created.id,
                note: created.note,
                source: created.source,
                created_by: created.created_by,
                created_by_name: created.created_by_name,
                created_by_role: created.created_by_role,
                created_at: created.created_at.toISOString(),
            },
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to add note';
        return { success: false, error: msg };
    }
}

/**
 * List a patient's notes, newest first. Scoped to the caller's organization.
 *
 * This also folds in **nursing notes** entered by nurses against the patient's
 * admissions. Nurses record notes on a separate table (`nursing_notes`, keyed by
 * admission), so historically they never appeared on the patient's profile. We
 * merge them here (read-only) so every "Patient Details" screen shows one unified,
 * chronological note history — nurse notes included — without any data migration.
 * Nursing notes are tagged `source: 'nursing'` so the UI can label them.
 */
export async function getPatientNotes(patientId: string): Promise<ListResult> {
    try {
        const { db, organizationId } = await requireTenantContext();

        const [notes, admissions] = await Promise.all([
            db.patientNote.findMany({
                where: { patient_id: patientId, organizationId },
                orderBy: { created_at: 'desc' },
                take: 200,
            }),
            db.admissions.findMany({
                where: { patient_id: patientId },
                select: { admission_id: true },
            }),
        ]);

        const patientNotes: PatientNoteDTO[] = notes.map((n: PatientNoteRow) => ({
            id: n.id,
            note: n.note,
            source: n.source,
            created_by: n.created_by,
            created_by_name: n.created_by_name,
            created_by_role: n.created_by_role,
            created_at: n.created_at.toISOString(),
        }));

        // Fold in nursing notes recorded against this patient's admission(s).
        let nursingNotes: PatientNoteDTO[] = [];
        const admissionIds = admissions.map((a: { admission_id: string }) => a.admission_id);
        if (admissionIds.length > 0) {
            const nnotes = await db.nursingNote.findMany({
                where: { admission_id: { in: admissionIds } },
                orderBy: { created_at: 'desc' },
                take: 200,
            });
            if (nnotes.length > 0) {
                const nurseIds = [...new Set(nnotes.map((n: any) => n.nurse_id).filter(Boolean))];
                const nurses = nurseIds.length
                    ? await db.user.findMany({
                          where: { id: { in: nurseIds } },
                          select: { id: true, name: true, username: true },
                      })
                    : [];
                const nurseName: Record<string, string> = Object.fromEntries(
                    nurses.map((u: any) => [u.id, u.name || u.username]),
                );
                nursingNotes = nnotes.map((n: any) => ({
                    // Negative id keeps React keys unique vs. positive patient-note ids.
                    id: -n.id,
                    note:
                        n.note_type && n.note_type.toLowerCase() !== 'general'
                            ? `${n.note_type}: ${n.details}`
                            : n.details,
                    source: 'nursing',
                    created_by: n.nurse_id ?? null,
                    created_by_name: nurseName[n.nurse_id] || 'Nurse',
                    created_by_role: 'nurse',
                    created_at: n.created_at.toISOString(),
                }));
            }
        }

        const merged = [...patientNotes, ...nursingNotes].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );

        return { success: true, data: merged };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to load notes';
        return { success: false, error: msg };
    }
}
