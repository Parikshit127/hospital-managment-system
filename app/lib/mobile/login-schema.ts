import { z } from 'zod';

export const deviceSchema = z.object({
    deviceId: z.string().min(8).max(100),
    deviceName: z.string().max(100).optional().nullable(),
    platform: z.enum(['android', 'ios']).optional().nullable(),
    appVersion: z.string().max(30).optional().nullable(),
});

export const locationSchema = z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracy: z.number().min(0).max(100000).optional().nullable(),
});

export const loginBodySchema = z.object({
    username: z.string().min(1).max(100),
    password: z.string().min(1).max(200),
    device: deviceSchema,
    location: locationSchema.optional().nullable(),
});

export const mfaBodySchema = z.object({
    mfaToken: z.string().min(10),
    code: z.string().min(4).max(10),
});

export const refreshBodySchema = z.object({
    refreshToken: z.string().min(20).max(200),
    deviceId: z.string().min(8).max(100),
});
