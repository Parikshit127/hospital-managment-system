'use server';

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

/** List a patient's notes, newest first. Scoped to the caller's organization. */
export async function getPatientNotes(patientId: string): Promise<ListResult> {
    try {
        const { db, organizationId } = await requireTenantContext();

        const notes = await db.patientNote.findMany({
            where: { patient_id: patientId, organizationId },
            orderBy: { created_at: 'desc' },
            take: 200,
        });

        return {
            success: true,
            data: notes.map((n: PatientNoteRow) => ({
                id: n.id,
                note: n.note,
                source: n.source,
                created_by: n.created_by,
                created_by_name: n.created_by_name,
                created_by_role: n.created_by_role,
                created_at: n.created_at.toISOString(),
            })),
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to load notes';
        return { success: false, error: msg };
    }
}
