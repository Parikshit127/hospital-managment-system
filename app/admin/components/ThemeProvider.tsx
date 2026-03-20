'use client';

import React, { createContext, useContext } from 'react';

interface BrandingData {
    primary_color: string;
    secondary_color: string;
    logo_url: string | null;
    portal_title: string;
    portal_subtitle: string;
    footer_text: string | null;
}

const defaultBranding: BrandingData = {
    primary_color: '#0d9488',
    secondary_color: '#1c1917',
    logo_url: null,
    portal_title: 'Hospital OS',
    portal_subtitle: 'Management System',
    footer_text: null,
};

const BrandingContext = createContext<BrandingData>(defaultBranding);

export function useBranding() {
    return useContext(BrandingContext);
}

function hexToHSL(hex: string): { h: number; s: number; l: number } {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }

    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function generateCSSVariables(branding: BrandingData): string {
    const primary = hexToHSL(branding.primary_color || '#0d9488');
    const secondary = hexToHSL(branding.secondary_color || '#1c1917');

    return `
        :root {
            --admin-primary: ${branding.primary_color};
            --admin-primary-h: ${primary.h};
            --admin-primary-s: ${primary.s}%;
            --admin-primary-l: ${primary.l}%;
            --admin-primary-light: hsl(${primary.h}, ${Math.max(primary.s - 10, 10)}%, 96%);
            --admin-primary-dark: hsl(${primary.h}, ${primary.s}%, ${Math.max(primary.l - 12, 10)}%);
            --admin-primary-muted: hsl(${primary.h}, ${Math.max(primary.s - 20, 10)}%, ${Math.min(primary.l + 30, 95)}%);
            --admin-primary-10: hsl(${primary.h}, ${primary.s}%, ${primary.l}%, 0.08);
            --admin-primary-15: hsl(${primary.h}, ${primary.s}%, ${primary.l}%, 0.12);
            --admin-primary-20: hsl(${primary.h}, ${primary.s}%, ${primary.l}%, 0.18);

            --admin-secondary: ${branding.secondary_color};
            --admin-secondary-h: ${secondary.h};
            --admin-secondary-s: ${secondary.s}%;
            --admin-secondary-l: ${secondary.l}%;

            --admin-sidebar-bg: hsl(${secondary.h}, ${Math.min(secondary.s + 5, 100)}%, ${Math.max(secondary.l - 2, 3)}%);
            --admin-sidebar-hover: hsl(${secondary.h}, ${secondary.s}%, ${secondary.l + 6}%);
            --admin-sidebar-border: hsl(${secondary.h}, ${secondary.s}%, ${secondary.l + 10}%);

            --admin-bg: #fafaf8;
            --admin-surface: #ffffff;
            --admin-surface-hover: #fafaf9;
            --admin-border: rgba(28, 25, 23, 0.08);
            --admin-border-light: rgba(28, 25, 23, 0.05);

            --admin-text: #1c1917;
            --admin-text-muted: #78716c;
        }
    `;
}

interface ThemeProviderProps {
    branding: BrandingData | null;
    children: React.ReactNode;
}

export default function ThemeProvider({ branding, children }: ThemeProviderProps) {
    const resolved = branding || defaultBranding;
    const cssVars = generateCSSVariables(resolved);

    return (
        <BrandingContext.Provider value={resolved}>
            <style dangerouslySetInnerHTML={{ __html: cssVars }} />
            {children}
        </BrandingContext.Provider>
    );
}
