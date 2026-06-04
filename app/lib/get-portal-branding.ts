'use server';

import { prisma } from '@/backend/db';
import { getSession, getPatientSession } from '@/app/lib/session';

export interface PortalBranding {
  orgName: string;
  orgCode: string;
  logoUrl: string | null;
  primaryColor: string;
  sidebarBg: string;
  accentColor: string;
  tagline: string | null;
}

// Defaults match the current Axten appearance exactly
const DEFAULTS: PortalBranding = {
  orgName: 'Axten Hospitals',
  orgCode: 'AXTEN',
  logoUrl: null, // null means "use the built-in Axten SVG"
  primaryColor: '#f97316',
  sidebarBg: '#0b1527',
  accentColor: '#1e3a6e',
  tagline: null,
};

export async function getPortalBranding(): Promise<PortalBranding> {
  try {
    let session: any = await getSession();
    if (!session) session = await getPatientSession();
    if (!session?.organization_id) return DEFAULTS;

    const org = await prisma.organization.findUnique({
      where: { id: session.organization_id },
      include: { branding: true },
    });

    if (!org) return DEFAULTS;

    const b = org.branding;

    return {
      orgName: org.name || DEFAULTS.orgName,
      orgCode: org.code || DEFAULTS.orgCode,
      logoUrl: b?.logo_url ?? org.logo_url ?? null,
      primaryColor: b?.primary_color || DEFAULTS.primaryColor,
      sidebarBg: b?.secondary_color || DEFAULTS.sidebarBg,
      accentColor: b?.accent_color || DEFAULTS.accentColor,
      tagline: b?.tagline ?? null,
    };
  } catch {
    return DEFAULTS;
  }
}
