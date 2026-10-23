import { hasPermission } from '@/app/lib/session';
import { ForbiddenError } from '@/backend/tenant';
import { requireAccess } from './require-access';

/**
 * Boolean form of requireAccess for "what should the UI show" questions (never for authorisation - the actions
 * enforce on their own). Same decision as the guarded action: the old `legacyKey` check, or the access engine for a
 * unit in enforce mode / a user with an access profile.
 */
export async function hasAccess(permission: string, legacyKey: string): Promise<boolean> {
    try {
        await requireAccess(permission, {
            legacy: async () => { if (!(await hasPermission(legacyKey))) throw new ForbiddenError(`FORBIDDEN_ERROR: ${legacyKey} required`); },
        });
        return true;
    } catch {
        return false;
    }
}
