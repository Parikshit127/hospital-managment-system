'use server';

/**
 * Guarded server-action layer for /finance/tally-export. Implementation:
 * app/lib/finance/tally-export-service.ts (not callable from the browser). Same rules as
 * gl-actions.ts: staff session that could open /finance today, session unit overrides any
 * client-supplied organizationId, id-addressed calls check ownership first.
 */
import { prisma } from '@/backend/db';
import { requireLegacyRouteAccess, isAccessDenial } from '@/app/lib/access/legacy-guard';
import { requireAccess } from '@/app/lib/access/require-access';
import * as tally from '@/app/lib/finance/tally-export-service';

const GATE = '/finance';

type Ctx = Awaited<ReturnType<typeof requireLegacyRouteAccess>>;

async function guarded<T>(permission: string, fn: (ctx: Ctx) => Promise<T>, onDeny: Record<string, unknown> = {}): Promise<T> {
    let ctx: Ctx;
    try {
        // `legacy` = the exact decision this layer made before Company-OS (same door as the /finance page).
        // While the unit's access_engine flag is `legacy` that alone decides; `shadow` compares; `enforce` replaces it.
        const a = await requireAccess(permission, { legacy: () => requireLegacyRouteAccess(GATE) });
        ctx = { session: a.session, organizationId: a.organizationId };
    } catch (e) {
        if (isAccessDenial(e)) return { success: false, error: 'Access denied', ...onDeny } as T;
        throw e;
    }
    return fn(ctx);
}

export async function getMyOrganizationId() {
    return guarded('finance.ledger.view', async (c) => ({ success: true, organizationId: c.organizationId }), { organizationId: null });
}

export async function generateTallyXML(options: Parameters<typeof tally.generateTallyXML>[0]) {
    return guarded('finance.tally.export', (c) => tally.generateTallyXML({ ...options, organizationId: c.organizationId }));
}

export async function getTallyExports(organizationId: string, filters?: Parameters<typeof tally.getTallyExports>[1]) {
    return guarded('finance.ledger.view', (c) => tally.getTallyExports(c.organizationId, filters), { exports: [] });
}

export async function downloadTallyExport(exportId: string) {
    return guarded('finance.tally.export', async (c) => {
        const owned = await prisma.tallyExport.findFirst({ where: { id: exportId, organizationId: c.organizationId }, select: { id: true } });
        if (!owned) return { success: false, error: 'Export not found or file missing' } as Awaited<ReturnType<typeof tally.downloadTallyExport>>;
        return tally.downloadTallyExport(exportId);
    });
}

export async function deleteTallyExport(exportId: string) {
    return guarded('finance.tally.export', async (c) => {
        const owned = await prisma.tallyExport.findFirst({ where: { id: exportId, organizationId: c.organizationId }, select: { id: true } });
        if (!owned) return { success: false, error: 'Failed to delete export' } as Awaited<ReturnType<typeof tally.deleteTallyExport>>;
        return tally.deleteTallyExport(exportId);
    });
}
