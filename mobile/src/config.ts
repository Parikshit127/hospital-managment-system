import Constants from 'expo-constants';

/** Production API origin. Override per build with EXPO_PUBLIC_API_URL (see eas.json / .env). */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://axtenos.com').replace(/\/+$/, '');

export const APP_VERSION: string = Constants.expoConfig?.version ?? '0.0.0';
