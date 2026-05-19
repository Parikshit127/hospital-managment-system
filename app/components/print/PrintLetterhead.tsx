'use client';

import React from 'react';

// ─── Inline SVG logo — no external file needed, works everywhere ───────────
// Exact replica of /public/axten-logo.svg
// Navy: #1e3a6e  |  Orange: #f97316

function AxtenLogoSvg({ height = 64 }: { height?: number }) {
  // Keep the original 400×120 viewBox ratio
  const width = Math.round((height * 400) / 120);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 400 120"
      width={width}
      height={height}
      aria-label="Axten Hospitals"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {/* "Axten" text */}
      <text
        x="10" y="72"
        fontFamily="Arial Black, Arial, sans-serif"
        fontWeight="900"
        fontSize="68"
        fill="#1e3a6e"
        letterSpacing="-2"
      >Axten</text>

      {/* Orange bars */}
      <rect x="10"  y="80" width="60"  height="8" fill="#f97316" rx="2" />
      <rect x="130" y="80" width="120" height="8" fill="#f97316" rx="2" />

      {/* HOSPITALS text */}
      <text
        x="75" y="89"
        fontFamily="Arial, sans-serif"
        fontWeight="700"
        fontSize="16"
        fill="#1e3a6e"
        letterSpacing="6"
      >HOSPITALS</text>

      {/* Subtitle */}
      <text
        x="10" y="110"
        fontFamily="Arial, sans-serif"
        fontWeight="400"
        fontSize="12"
        fill="#1e3a6e"
      >A Unit of TAH Global Healthcare Pvt. Ltd.</text>

      {/* Circle emblem */}
      <circle cx="360" cy="55" r="48" fill="none" stroke="#1e3a6e" strokeWidth="3" />
      <circle cx="360" cy="55" r="42" fill="none" stroke="#1e3a6e" strokeWidth="1" />

      {/* Cross inside circle */}
      <rect x="350" y="35" width="20" height="40" fill="none" stroke="#f97316" strokeWidth="3" rx="3" />
      <rect x="340" y="45" width="40" height="20" fill="none" stroke="#f97316" strokeWidth="3" rx="3" />
    </svg>
  );
}

// ─── React component (used in invoices, prescriptions, receipts) ────────────

interface PrintLetterheadProps {
  /** Content rendered on the right side (bill number, doctor name, etc.) */
  rightSlot?: React.ReactNode;
  /** Extra Tailwind classes on the wrapper */
  className?: string;
}

export function PrintLetterhead({ rightSlot, className = '' }: PrintLetterheadProps) {
  return (
    <div
      className={`flex items-start justify-between pb-5 mb-6 ${className}`}
      style={{ borderBottom: '3px solid #1e3a6e' }}
    >
      <AxtenLogoSvg height={64} />

      {rightSlot && (
        <div className="text-right shrink-0 ml-6">
          {rightSlot}
        </div>
      )}
    </div>
  );
}

// ─── CSS for window.open() print popups (no Tailwind available) ─────────────

export const LETTERHEAD_PRINT_CSS = `
  .lh-wrap {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding-bottom: 18px;
    margin-bottom: 24px;
    border-bottom: 3px solid #1e3a6e;
  }
  .lh-right { text-align: right; }
`;

// ─── Inline SVG string for window.open() popups ──────────────────────────────
// Returns the full letterhead as an HTML string — no external files needed.

export function letterheadHtml(rightHtml = '') {
  return `
    <div class="lh-wrap">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 120" width="267" height="80"
           aria-label="Axten Hospitals" style="display:block;flex-shrink:0;">
        <text x="10" y="72" font-family="Arial Black, Arial, sans-serif" font-weight="900"
              font-size="68" fill="#1e3a6e" letter-spacing="-2">Axten</text>
        <rect x="10"  y="80" width="60"  height="8" fill="#f97316" rx="2"/>
        <rect x="130" y="80" width="120" height="8" fill="#f97316" rx="2"/>
        <text x="75" y="89" font-family="Arial, sans-serif" font-weight="700"
              font-size="16" fill="#1e3a6e" letter-spacing="6">HOSPITALS</text>
        <text x="10" y="110" font-family="Arial, sans-serif" font-weight="400"
              font-size="12" fill="#1e3a6e">A Unit of TAH Global Healthcare Pvt. Ltd.</text>
        <circle cx="360" cy="55" r="48" fill="none" stroke="#1e3a6e" stroke-width="3"/>
        <circle cx="360" cy="55" r="42" fill="none" stroke="#1e3a6e" stroke-width="1"/>
        <rect x="350" y="35" width="20" height="40" fill="none" stroke="#f97316" stroke-width="3" rx="3"/>
        <rect x="340" y="45" width="40" height="20" fill="none" stroke="#f97316" stroke-width="3" rx="3"/>
      </svg>
      ${rightHtml ? `<div class="lh-right">${rightHtml}</div>` : ''}
    </div>
  `;
}
