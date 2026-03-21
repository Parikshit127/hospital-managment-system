import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/backend/db';
import {
  Building2, MapPin, Phone, Mail, Globe, Calendar,
  Shield, Bed, Stethoscope, Clock
} from 'lucide-react';

interface HospitalPageProps {
  params: Promise<{ slug: string }>;
}

async function getOrganizationBySlug(slug: string) {
  const org = await prisma.organization.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      address: true,
      phone: true,
      email: true,
      logo_url: true,
      is_active: true,
      plan: true,
      hospital_type: true,
      bed_capacity: true,
      accreditation_body: true,
      accreditation_number: true,
      registration_number: true,
      registration_authority: true,
      established_year: true,
      website: true,
      specialties: true,
      branding: {
        select: {
          primary_color: true,
          secondary_color: true,
          portal_title: true,
          portal_subtitle: true,
        },
      },
    },
  });

  return org;
}

export async function generateMetadata({ params }: HospitalPageProps): Promise<Metadata> {
  const { slug } = await params;
  const org = await getOrganizationBySlug(slug);

  if (!org) {
    return {
      title: 'Hospital Not Found',
      description: 'The hospital you are looking for does not exist.',
    };
  }

  return {
    title: `${org.name} — Hospital Overview`,
    description: `${org.name} — ${org.hospital_type || 'Hospital'}. ${org.address || ''}`.trim(),
    openGraph: {
      title: org.name,
      description: `Visit ${org.name} for quality healthcare services.`,
      type: 'website',
      ...(org.logo_url && { images: [{ url: org.logo_url }] }),
    },
  };
}

export default async function HospitalPublicPage({ params }: HospitalPageProps) {
  const { slug } = await params;
  const org = await getOrganizationBySlug(slug);

  if (!org || !org.is_active) {
    notFound();
  }

  const primaryColor = org.branding?.primary_color || '#10b981';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {org.logo_url ? (
              <img
                src={org.logo_url}
                alt={`${org.name} logo`}
                className="h-10 w-10 rounded-lg object-contain"
              />
            ) : (
              <div
                className="h-10 w-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: primaryColor }}
              >
                <Building2 className="h-5 w-5 text-white" />
              </div>
            )}
            <div>
              <h1 className="text-lg font-semibold text-slate-900">{org.name}</h1>
              {org.hospital_type && (
                <p className="text-xs text-slate-500">{org.hospital_type}</p>
              )}
            </div>
          </div>
          {org.website && (
            <a
              href={org.website.startsWith('http') ? org.website : `https://${org.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Globe className="h-4 w-4" />
              Visit Website
            </a>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-8">
        <div className="text-center max-w-3xl mx-auto">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-6"
            style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
          >
            <Stethoscope className="h-3.5 w-3.5" />
            {org.hospital_type || 'Healthcare Facility'}
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
            {org.name}
          </h2>
          {org.established_year && (
            <p className="mt-4 text-sm text-slate-500 flex items-center justify-center gap-1.5">
              <Calendar className="h-4 w-4" />
              Established in {org.established_year}
            </p>
          )}
        </div>
      </section>

      {/* Quick Info Cards */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {org.phone && (
            <InfoCard
              icon={<Phone className="h-5 w-5" />}
              label="Phone"
              value={org.phone}
              href={`tel:${org.phone}`}
              color={primaryColor}
            />
          )}
          {org.email && (
            <InfoCard
              icon={<Mail className="h-5 w-5" />}
              label="Email"
              value={org.email}
              href={`mailto:${org.email}`}
              color={primaryColor}
            />
          )}
          {org.address && (
            <InfoCard
              icon={<MapPin className="h-5 w-5" />}
              label="Address"
              value={org.address}
              color={primaryColor}
            />
          )}
          {org.bed_capacity && (
            <InfoCard
              icon={<Bed className="h-5 w-5" />}
              label="Bed Capacity"
              value={`${org.bed_capacity} Beds`}
              color={primaryColor}
            />
          )}
        </div>
      </section>

      {/* Details Grid */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Specialties */}
          {org.specialties && org.specialties.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Stethoscope className="h-5 w-5" style={{ color: primaryColor }} />
                Specialties
              </h3>
              <div className="flex flex-wrap gap-2">
                {org.specialties.map((specialty, index) => (
                  <span
                    key={index}
                    className="px-3 py-1.5 text-sm font-medium rounded-full border border-slate-200 text-slate-700 bg-slate-50"
                  >
                    {specialty}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Accreditation & Registration */}
          {(org.accreditation_body || org.registration_number) && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Shield className="h-5 w-5" style={{ color: primaryColor }} />
                Accreditation &amp; Registration
              </h3>
              <div className="space-y-3">
                {org.accreditation_body && (
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 rounded-md bg-emerald-50">
                      <Shield className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        {org.accreditation_body}
                      </p>
                      {org.accreditation_number && (
                        <p className="text-xs text-slate-500">
                          Accreditation No: {org.accreditation_number}
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {org.registration_number && (
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 rounded-md bg-blue-50">
                      <Building2 className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        Registration No: {org.registration_number}
                      </p>
                      {org.registration_authority && (
                        <p className="text-xs text-slate-500">
                          Authority: {org.registration_authority}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Contact Details */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Phone className="h-5 w-5" style={{ color: primaryColor }} />
              Contact Information
            </h3>
            <div className="space-y-3">
              {org.phone && (
                <a
                  href={`tel:${org.phone}`}
                  className="flex items-center gap-3 text-sm text-slate-700 hover:text-slate-900 transition-colors"
                >
                  <Phone className="h-4 w-4 text-slate-400" />
                  {org.phone}
                </a>
              )}
              {org.email && (
                <a
                  href={`mailto:${org.email}`}
                  className="flex items-center gap-3 text-sm text-slate-700 hover:text-slate-900 transition-colors"
                >
                  <Mail className="h-4 w-4 text-slate-400" />
                  {org.email}
                </a>
              )}
              {org.address && (
                <div className="flex items-start gap-3 text-sm text-slate-700">
                  <MapPin className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                  {org.address}
                </div>
              )}
              {org.website && (
                <a
                  href={org.website.startsWith('http') ? org.website : `https://${org.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 text-sm text-slate-700 hover:text-slate-900 transition-colors"
                >
                  <Globe className="h-4 w-4 text-slate-400" />
                  {org.website}
                </a>
              )}
            </div>
          </div>

          {/* Quick Facts */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5" style={{ color: primaryColor }} />
              At a Glance
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {org.established_year && (
                <QuickFact label="Established" value={String(org.established_year)} />
              )}
              {org.hospital_type && (
                <QuickFact label="Type" value={org.hospital_type} />
              )}
              {org.bed_capacity && (
                <QuickFact label="Bed Capacity" value={String(org.bed_capacity)} />
              )}
              {org.specialties && org.specialties.length > 0 && (
                <QuickFact label="Specialties" value={String(org.specialties.length)} />
              )}
              {org.accreditation_body && (
                <QuickFact label="Accreditation" value={org.accreditation_body} />
              )}
              {org.plan && (
                <QuickFact label="Plan" value={org.plan.charAt(0).toUpperCase() + org.plan.slice(1)} />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              &copy; {new Date().getFullYear()} {org.name}. All rights reserved.
            </p>
            <p className="text-xs text-slate-400">
              Powered by HospitalOS
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function InfoCard({
  icon,
  label,
  value,
  href,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
  color: string;
}) {
  const content = (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <div
          className="p-2 rounded-lg shrink-0"
          style={{ backgroundColor: `${color}15`, color }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            {label}
          </p>
          <p className="text-sm font-semibold text-slate-800 mt-0.5 break-words">
            {value}
          </p>
        </div>
      </div>
    </div>
  );

  if (href) {
    return (
      <a href={href} className="block">
        {content}
      </a>
    );
  }
  return content;
}

function QuickFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
