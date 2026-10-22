import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

/** Everything sensitive lives in the OS keystore (Android Keystore / iOS Keychain), never in plain storage. */

const K_ACCESS = 'axten_hr_access';
const K_REFRESH = 'axten_hr_refresh';
const K_DEVICE = 'axten_hr_device_id';

export interface Tokens {
    accessToken: string;
    refreshToken: string;
}

export async function loadTokens(): Promise<Tokens | null> {
    const [accessToken, refreshToken] = await Promise.all([
        SecureStore.getItemAsync(K_ACCESS), SecureStore.getItemAsync(K_REFRESH),
    ]);
    return accessToken && refreshToken ? { accessToken, refreshToken } : null;
}

export async function saveTokens(t: Tokens): Promise<void> {
    await Promise.all([
        SecureStore.setItemAsync(K_ACCESS, t.accessToken, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }),
        SecureStore.setItemAsync(K_REFRESH, t.refreshToken, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }),
    ]);
}

export async function clearTokens(): Promise<void> {
    await Promise.all([SecureStore.deleteItemAsync(K_ACCESS), SecureStore.deleteItemAsync(K_REFRESH)]);
}

let cachedDeviceId: string | null = null;

/** Stable per-install ID. The server binds each refresh token to it, so a copied token is useless elsewhere. */
export async function getDeviceId(): Promise<string> {
    if (cachedDeviceId) return cachedDeviceId;
    let id = await SecureStore.getItemAsync(K_DEVICE);
    if (!id) {
        id = Crypto.randomUUID();
        await SecureStore.setItemAsync(K_DEVICE, id, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
    }
    cachedDeviceId = id;
    return id;
}
