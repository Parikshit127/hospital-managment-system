'use client';

import React from 'react';
import type { BillBranding } from '@/app/lib/bill-branding';

// ─── React component (used in invoices, prescriptions, receipts) ────────────

interface PrintLetterheadProps {
  rightSlot?: React.ReactNode;
  className?: string;
  branding?: BillBranding | null;
}

export function PrintLetterhead({ rightSlot, className = '', branding }: PrintLetterheadProps) {
  const logoSrc = branding?.logoUrl || '/logo.jpeg';
  const logoAlt = branding?.hospitalName || 'Hospital';
  const accentColor = branding?.accentColor || '#1e3a6e';

  return (
    <div
      className={`flex items-start justify-between pb-5 mb-6 ${className}`}
      style={{ borderBottom: `3px solid ${accentColor}` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoSrc}
        alt={logoAlt}
        style={{ height: '72px', width: 'auto', display: 'block', flexShrink: 0 }}
      />

      {rightSlot && (
        <div className="text-right shrink-0 ml-6">
          {rightSlot}
        </div>
      )}
    </div>
  );
}

// ─── CSS for window.open() print popups ─────────────────────────────────────

export function getLetterheadPrintCss(branding?: BillBranding | null): string {
  const accentColor = branding?.accentColor || '#1e3a6e';
  return `
  .lh-wrap {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding-bottom: 18px;
    margin-bottom: 24px;
    border-bottom: 3px solid ${accentColor};
  }
  .lh-right { text-align: right; }
`;
}

/** @deprecated Use getLetterheadPrintCss(branding) instead */
export const LETTERHEAD_PRINT_CSS = getLetterheadPrintCss();

// ─── HTML string for window.open() popups ────────────────────────────────────

export function letterheadHtml(rightHtml = '', branding?: BillBranding | null) {
  const logoSrc = branding?.logoUrl || '/logo.jpeg';
  const logoAlt = branding?.hospitalName || 'Hospital';
  return `
    <div class="lh-wrap" style="position:relative;">
      <img src="${logoSrc}" alt="${logoAlt}" style="height:72px;width:auto;display:block;flex-shrink:0;" />
      ${rightHtml ? `<div class="lh-right">${rightHtml}</div>` : ''}
    </div>
  `;
}
