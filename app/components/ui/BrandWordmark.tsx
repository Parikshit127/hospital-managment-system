/**
 * BrandWordmark — renders an organization's name as a styled logo wordmark
 * (first word large, remaining words spaced + underlined in the accent color).
 * Fully data-driven: pass the org name + colors from branding, so every
 * deployment shows its own brand. Replaces the old hardcoded "Axten" SVGs.
 *
 * Presentational only (no hooks) — safe in both server and client components.
 */
import type { CSSProperties } from 'react';

export interface BrandWordmarkProps {
  name: string;
  /** Accent color for the underline bars (e.g. brand primary / gold). */
  accent: string;
  /** Main text color. Use a light color on dark backgrounds, dark on light. */
  textColor?: string;
  /** Optional small tagline line under the wordmark. */
  tagline?: string | null;
  taglineColor?: string;
  /** Rendered pixel height. */
  height?: number;
  className?: string;
  style?: CSSProperties;
}

export default function BrandWordmark({
  name,
  accent,
  textColor = '#ffffff',
  tagline,
  taglineColor = 'rgba(255,255,255,0.7)',
  height = 44,
  className,
  style,
}: BrandWordmarkProps) {
  const trimmed = (name || '').trim();
  const parts = trimmed.split(/\s+/);
  const head = parts[0] || 'Hospital';
  const tail = parts.slice(1).join(' ').toUpperCase();

  // Rough width estimates so the SVG viewBox hugs the text.
  const headW = head.length * 34 + 8;
  const tailW = tail ? tail.length * 11 + 20 : 0;
  const totalW = Math.max(headW + tailW, 120);
  const vbH = tagline ? 92 : 80;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${totalW} ${vbH}`}
      style={{ height, width: 'auto', flexShrink: 0, ...style }}
      className={className}
      role="img"
      aria-label={trimmed}
    >
      <text
        x="0"
        y="52"
        fontFamily="'Outfit', 'Arial Black', Arial, sans-serif"
        fontWeight="800"
        fontSize="56"
        fill={textColor}
        letterSpacing="-1"
      >
        {head}
      </text>
      <rect x="0" y="62" width={Math.min(headW - 12, 60)} height="7" fill={accent} rx="2" />
      {tail && (
        <>
          <text
            x={headW}
            y="52"
            fontFamily="'Outfit', Arial, sans-serif"
            fontWeight="700"
            fontSize="15"
            fill={textColor}
            letterSpacing="5"
          >
            {tail}
          </text>
          <rect x={headW} y="62" width={Math.max(tailW - 20, 24)} height="7" fill={accent} rx="2" />
        </>
      )}
      {tagline && (
        <text
          x="0"
          y={vbH - 4}
          fontFamily="'Inter', Arial, sans-serif"
          fontWeight="400"
          fontSize="9"
          fill={taglineColor}
          letterSpacing="0.3"
        >
          {tagline}
        </text>
      )}
    </svg>
  );
}
