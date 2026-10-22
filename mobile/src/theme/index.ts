import { useColorScheme } from 'react-native';

const light = {
    bg: '#F3F6F7', card: '#FFFFFF', text: '#0F1B2D', sub: '#5B6B7C', border: '#E1E7EC', muted: '#EAF0F2',
    primary: '#0F766E', primarySoft: '#D9F0EC', onPrimary: '#FFFFFF',
    danger: '#DC2626', dangerSoft: '#FDE8E8', warn: '#B45309', warnSoft: '#FEF3C7',
    ok: '#047857', okSoft: '#D1FAE5', info: '#1D4ED8', infoSoft: '#DBEAFE', overlay: 'rgba(15,27,45,0.45)',
};
const dark: typeof light = {
    bg: '#0B1220', card: '#131C2E', text: '#E8EEF5', sub: '#94A3B8', border: '#243049', muted: '#1B263B',
    primary: '#2DD4BF', primarySoft: '#0F3D3A', onPrimary: '#062C29',
    danger: '#F87171', dangerSoft: '#3B1717', warn: '#FBBF24', warnSoft: '#3A2D0B',
    ok: '#34D399', okSoft: '#0B3325', info: '#60A5FA', infoSoft: '#12284D', overlay: 'rgba(0,0,0,0.6)',
};

export type Theme = typeof light;
export const useTheme = (): Theme => (useColorScheme() === 'dark' ? dark : light);

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral' | 'primary';

export function toneColors(t: Theme, tone: Tone): { fg: string; bg: string } {
    switch (tone) {
        case 'ok': return { fg: t.ok, bg: t.okSoft };
        case 'warn': return { fg: t.warn, bg: t.warnSoft };
        case 'danger': return { fg: t.danger, bg: t.dangerSoft };
        case 'info': return { fg: t.info, bg: t.infoSoft };
        case 'primary': return { fg: t.primary, bg: t.primarySoft };
        default: return { fg: t.sub, bg: t.muted };
    }
}

/** Attendance day status → colour tone. */
export function statusTone(status: string | null | undefined): Tone {
    switch (status) {
        case 'Present': case 'Approved': return 'ok';
        case 'Half-Day': case 'Pending': case 'Not Marked': return 'warn';
        case 'Absent': case 'Rejected': return 'danger';
        case 'Leave': case 'Holiday': return 'info';
        case 'Week-Off': case 'Upcoming': case 'N/A': case 'Cancelled': return 'neutral';
        default: return 'neutral';
    }
}
