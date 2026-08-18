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
  portalTitle: string;
  portalSubtitle: string;
  footerText: string | null;
}

// Defaults match the current Axten appearance exactly.
// These are the LAST-RESORT fallback only: every deployment renders from its own
// database (Organization + OrganizationBranding). They are intentionally kept as
// "Axten" so the live hospital is never affected if a branding row is missing.
const DEFAULTS: PortalBranding = {
  orgName: 'Axten Hospitals',
  orgCode: 'AXTEN',
  logoUrl: null, // null means "render the styled name wordmark"
  primaryColor: '#f97316',
  sidebarBg: '#0b1527',
  accentColor: '#1e3a6e',
  tagline: null,
  portalTitle: 'Axten Hospitals',
  portalSubtitle: 'Intelligence Platform',
  footerText: '© 2026 Axten Hospitals. All rights reserved.',
};

function toBranding(org: {
  name: string | null;
  code: string | null;
  logo_url: string | null;
  branding: {
    logo_url: string | null;
    primary_color: string | null;
    secondary_color: string | null;
    accent_color: string | null;
    tagline: string | null;
    portal_title: string | null;
    portal_subtitle: string | null;
    footer_text: string | null;
  } | null;
} | null): PortalBranding {
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
    portalTitle: b?.portal_title || org.name || DEFAULTS.portalTitle,
    portalSubtitle: b?.portal_subtitle || DEFAULTS.portalSubtitle,
    footerText: b?.footer_text ?? DEFAULTS.footerText,
  };
}

export async function getPortalBranding(): Promise<PortalBranding> {
  try {
    let session: any = await getSession();
    if (!session) session = await getPatientSession();
    if (!session?.organization_id) return DEFAULTS;

    const org = await prisma.organization.findUnique({
      where: { id: session.organization_id },
      include: { branding: true },
    });

    return toBranding(org);
  } catch {
    return DEFAULTS;
  }
}

/**
 * Branding for pre-login surfaces (login page, patient login, browser title)
 * where there is no session yet. Resolves the deployment's "landing" org by
 * slug (NEXT_PUBLIC_DEFAULT_ORG_SLUG, default "avani"). Falls back to the
 * first active organization in the database, so any tenant deployment shows
 * correct branding without any per-deployment env change.
 */

export async function getDefaultBranding(): Promise<PortalBranding> {
  try {
    const slug = process.env.NEXT_PUBLIC_DEFAULT_ORG_SLUG || 'avani';
    let org = await prisma.organization.findFirst({
      where: { slug },
      include: { branding: true },
    });
    if (!org) {
      org = await prisma.organization.findFirst({
        where: { is_active: true },
        orderBy: { created_at: 'asc' },
        include: { branding: true },
      });
    }
    return toBranding(org);
  } catch {
    return DEFAULTS;
  }
}
