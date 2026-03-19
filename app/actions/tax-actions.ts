'use server';

import { requireTenantContext } from '@/backend/tenant';

function serialize<T>(data: T): T {
    return JSON.parse(JSON.stringify(data, (_, value) =>
        typeof value === 'object' && value !== null && value.constructor?.name === 'Decimal'
            ? Number(value)
            : value
    ));
}

export async function getTaxConfigs() {
    try {
        const { db } = await requireTenantContext();
        const configs = await db.taxConfig.findMany({
            where: { is_active: true },
            orderBy: { tax_name: 'asc' },
        });
        return { success: true, data: serialize(configs) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function addTaxConfig(data: {
    tax_name: string;
    tax_code: string;
    rate: number;
    is_default?: boolean;
    applicable_to?: string;
}) {
    try {
        const { db } = await requireTenantContext();

        // If this is set as default, unset other defaults
        if (data.is_default) {
            await db.taxConfig.updateMany({
                where: { is_default: true },
                data: { is_default: false },
            });
        }

        const config = await db.taxConfig.create({
            data: {
                tax_name: data.tax_name,
                tax_code: data.tax_code.toUpperCase(),
                rate: data.rate,
                is_default: data.is_default || false,
                applicable_to: data.applicable_to || null,
            },
        });
        return { success: true, data: serialize(config) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updateTaxConfig(id: number, data: {
    tax_name?: string;
    rate?: number;
    is_default?: boolean;
    applicable_to?: string;
    is_active?: boolean;
}) {
    try {
        const { db } = await requireTenantContext();

        if (data.is_default) {
            await db.taxConfig.updateMany({
                where: { is_default: true, id: { not: id } },
                data: { is_default: false },
            });
        }

        const config = await db.taxConfig.update({ where: { id }, data });
        return { success: true, data: serialize(config) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getDefaultTaxRate() {
    try {
        const { db } = await requireTenantContext();
        const defaultTax = await db.taxConfig.findFirst({
            where: { is_default: true, is_active: true },
        });
        return {
            success: true,
            data: defaultTax ? { rate: Number(defaultTax.rate), name: defaultTax.tax_name } : { rate: 18, name: 'GST' },
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
