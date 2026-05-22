'use client';

import React from 'react';

// ─── React component (used in invoices, prescriptions, receipts) ────────────

interface PrintLetterheadProps {
  rightSlot?: React.ReactNode;
  className?: string;
}

export function PrintLetterhead({ rightSlot, className = '' }: PrintLetterheadProps) {
  return (
    <div
      className={`flex items-start justify-between pb-5 mb-6 ${className}`}
      style={{ borderBottom: '3px solid #1e3a6e' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.jpeg"
        alt="Axten Hospitals"
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

// ─── HTML string for window.open() popups ────────────────────────────────────

export function letterheadHtml(rightHtml = '') {
  return `
    <div class="lh-wrap">
      <img src="/logo.jpeg" alt="Axten Hospitals" style="height:72px;width:auto;display:block;flex-shrink:0;" />
      ${rightHtml ? `<div class="lh-right">${rightHtml}</div>` : ''}
    </div>
  `;
}
