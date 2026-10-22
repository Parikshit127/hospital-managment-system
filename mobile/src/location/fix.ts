import * as Location from 'expo-location';

/**
 * One place that talks to the GPS. Used by login (to record where you signed in) and by Punch.
 * We refuse obviously bad fixes here so the user gets an instant, readable message; the SERVER still does the
 * authoritative geofence check, so nothing here is a security boundary.
 */

export interface GpsFix {
    lat: number;
    lng: number;
    accuracy: number | null;
    mocked: boolean;
}

export class LocationError extends Error {
    constructor(message: string, public kind: 'denied' | 'disabled' | 'weak' | 'mocked' | 'failed') {
        super(message);
        this.name = 'LocationError';
    }
}

/** Accuracy (metres) we accept for a punch. A looser fix could place you on the wrong side of the fence. */
const MAX_ACCURACY_M = 150;

export async function ensurePermission(): Promise<void> {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.status === 'granted') return;
    const asked = await Location.requestForegroundPermissionsAsync();
    if (asked.status !== 'granted') {
        throw new LocationError(
            'Location permission is needed to punch in and out. Allow it in Settings > Apps > Axten HR > Permissions.',
            'denied',
        );
    }
}

async function read(): Promise<Location.LocationObject> {
    return Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
}

/**
 * Get a trustworthy fix. `strict` (punching) rejects weak accuracy and fake GPS; non-strict (login) only needs
 * "best effort" and reports mock status through `mocked`.
 */
export async function getFix(opts: { strict: boolean }): Promise<GpsFix> {
    await ensurePermission();
    if (!(await Location.hasServicesEnabledAsync())) {
        throw new LocationError('Turn on Location (GPS) in your phone settings and try again.', 'disabled');
    }

    let loc: Location.LocationObject;
    try {
        loc = await read();
        // First fix is often coarse right after the GPS wakes up; one retry usually tightens it.
        if (opts.strict && (loc.coords.accuracy ?? Infinity) > MAX_ACCURACY_M) loc = await read();
    } catch {
        throw new LocationError('Could not get your location. Move to an open area and try again.', 'failed');
    }

    const accuracy = loc.coords.accuracy ?? null;
    const mocked = loc.mocked === true;
    if (opts.strict) {
        if (mocked) throw new LocationError('Fake/mock location detected. Turn it off to punch.', 'mocked');
        if (accuracy === null || accuracy > MAX_ACCURACY_M) {
            throw new LocationError(`GPS signal is weak (±${accuracy === null ? '?' : Math.round(accuracy)} m). Move to an open area and retry.`, 'weak');
        }
    }
    return { lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy, mocked };
}
