import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { authApi } from '@/api/hr';
import { ApiError, setSessionLostHandler, setTokens, currentTokens } from '@/api/client';
import type { Geofence, LoginResult, Me } from '@/api/types';
import { getDeviceId } from './storage';
import { getFix, type GpsFix } from '@/location/fix';
import { APP_VERSION } from '@/config';

type Status = 'loading' | 'out' | 'in' | 'offline';

interface AuthState {
    status: Status;
    me: Me | null;
    /** Where the last sign-in sat relative to the work geofence (informational). */
    geofence: Geofence | null;
    /** Set when the sign-in could not capture a GPS location. */
    locationWarning: string | null;
    mfaToken: string | null;
    signIn(username: string, password: string): Promise<void>;
    submitMfa(code: string): Promise<void>;
    cancelMfa(): void;
    signOut(): Promise<void>;
    reload(): Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export const useAuth = (): AuthState => {
    const v = useContext(Ctx);
    if (!v) throw new Error('useAuth outside AuthProvider');
    return v;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [status, setStatus] = useState<Status>('loading');
    const [me, setMe] = useState<Me | null>(null);
    const [geofence, setGeofence] = useState<Geofence | null>(null);
    const [locationWarning, setLocationWarning] = useState<string | null>(null);
    const [mfaToken, setMfaToken] = useState<string | null>(null);

    const clear = useCallback(() => { setMe(null); setGeofence(null); setMfaToken(null); setStatus('out'); }, []);

    // Any API call that discovers the session is dead (revoked, disabled, refresh failed) lands here.
    useEffect(() => { setSessionLostHandler(clear); return () => setSessionLostHandler(null); }, [clear]);

    const reload = useCallback(async () => {
        try {
            const r = await authApi.me();
            setMe(r.data);
            setStatus('in');
        } catch (e) {
            if (e instanceof ApiError && e.isNetwork) setStatus('offline');
            else if (e instanceof ApiError && e.status >= 500) setStatus('offline');
            else clear();
        }
    }, [clear]);

    // App start: if we hold tokens, validate them (this silently refreshes an expired access token).
    useEffect(() => {
        (async () => {
            const t = await currentTokens();
            if (!t) { setStatus('out'); return; }
            await reload();
        })();
    }, [reload]);

    const finish = useCallback(async (res: LoginResult) => {
        if (res.mfaRequired) { setMfaToken(res.mfaToken); return; }
        await setTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken });
        setMe({ user: res.user, organization: res.organization, employee: res.employee, capabilities: res.capabilities });
        setGeofence(res.geofence);
        setMfaToken(null);
        setStatus('in');
    }, []);

    const signIn = useCallback(async (username: string, password: string) => {
        // Location is recorded at sign-in. If GPS is unavailable we still let the person in (they can view leave,
        // roster, approvals) — punching has its own strict check — but we remember to warn them.
        let fix: GpsFix | null = null;
        setLocationWarning(null);
        try { fix = await getFix({ strict: false }); }
        catch (e: any) { setLocationWarning(e?.message ?? 'Location unavailable'); }

        const device = {
            deviceId: await getDeviceId(),
            deviceName: [Device.manufacturer, Device.modelName].filter(Boolean).join(' ') || null,
            platform: Platform.OS === 'ios' ? ('ios' as const) : ('android' as const),
            appVersion: APP_VERSION,
        };
        const r = await authApi.login({
            username: username.trim(), password, device,
            location: fix ? { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy } : null,
        });
        await finish(r.data);
    }, [finish]);

    const submitMfa = useCallback(async (code: string) => {
        if (!mfaToken) return;
        const r = await authApi.mfa({ mfaToken, code: code.trim() });
        await finish(r.data);
    }, [mfaToken, finish]);

    const signOut = useCallback(async () => {
        try { await authApi.logout(); } catch { /* offline or already revoked: still sign out locally */ }
        await setTokens(null);
        clear();
    }, [clear]);

    const value = useMemo<AuthState>(() => ({
        status, me, geofence, locationWarning, mfaToken, signIn, submitMfa, cancelMfa: () => setMfaToken(null), signOut, reload,
    }), [status, me, geofence, locationWarning, mfaToken, signIn, submitMfa, signOut, reload]);

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
