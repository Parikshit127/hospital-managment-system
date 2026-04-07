'use server';

import { requireTenantContext } from '@/backend/tenant';
import { logAudit } from '@/app/lib/audit';

function serialize<T>(data: T): T {
    return JSON.parse(JSON.stringify(data, (_, value) =>
        typeof value === 'object' && value !== null && value.constructor?.name === 'Decimal'
            ? Number(value)
            : value
    ));
}

// ============================================
// IPD SERVICE MASTER
// ============================================

export async function getIpdServices(category?: string) {
    try {
        const { db } = await requireTenantContext();
        const where: any = { is_active: true };
        if (category) where.service_category = category;

        const services = await db.ipdServiceMaster.findMany({
            where,
            include: { tariff_rates: { where: { is_active: true } } },
            orderBy: { service_name: 'asc' },
        });
        return { success: true, data: serialize(services) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function addIpdService(data: {
    service_code: string;
    service_name: string;
    service_category: string;
    default_rate: number;
    hsn_sac_code?: string;
    tax_rate?: number;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const service = await db.ipdServiceMaster.create({
            data: {
                service_code: data.service_code.toUpperCase(),
                service_name: data.service_name,
                service_category: data.service_category,
                default_rate: data.default_rate,
                hsn_sac_code: data.hsn_sac_code || null,
                tax_rate: data.tax_rate || 0,
                organizationId,
            },
        });
        await logAudit({
            action: 'CREATE_IPD_SERVICE',
            module: 'ipd',
            entity_type: 'ipd_service_master',
            entity_id: String(service.id),
            details: JSON.stringify({ service_code: data.service_code, service_name: data.service_name }),
        });
        return { success: true, data: serialize(service) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updateIpdService(id: number, data: {
    service_name?: string;
    default_rate?: number;
    hsn_sac_code?: string;
    tax_rate?: number;
    is_active?: boolean;
}) {
    try {
        const { db } = await requireTenantContext();
        const service = await db.ipdServiceMaster.update({ where: { id }, data });
        return { success: true, data: serialize(service) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ============================================
// TARIFF RATES
// ============================================

export async function getTariffRates(serviceId?: number) {
    try {
        const { db } = await requireTenantContext();
        const where: any = { is_active: true };
        if (serviceId) where.service_id = serviceId;

        const rates = await db.ipdTariffRate.findMany({
            where,
            include: { service: { select: { service_name: true, service_code: true } } },
            orderBy: { tariff_category: 'asc' },
        });
        return { success: true, data: serialize(rates) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function addTariffRate(data: {
    service_id: number;
    tariff_category: string;
    rate: number;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const rate = await db.ipdTariffRate.create({
            data: {
                service_id: data.service_id,
                tariff_category: data.tariff_category,
                rate: data.rate,
                organizationId,
            },
        });
        return { success: true, data: serialize(rate) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updateTariffRate(id: number, data: { rate?: number; is_active?: boolean }) {
    try {
        const { db } = await requireTenantContext();
        const rate = await db.ipdTariffRate.update({ where: { id }, data });
        return { success: true, data: serialize(rate) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ============================================
// IPD PACKAGES
// ============================================

export async function getIpdPackages() {
    try {
        const { db } = await requireTenantContext();
        const packages = await db.ipdPackage.findMany({
            where: { is_active: true },
            orderBy: { package_name: 'asc' },
        });
        return { success: true, data: serialize(packages) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function addIpdPackage(data: {
    package_code: string;
    package_name: string;
    description?: string;
    total_amount: number;
    validity_days?: number;
    inclusions: any[];
    exclusions?: string;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();
        const pkg = await db.ipdPackage.create({
            data: {
                package_code: data.package_code.toUpperCase(),
                package_name: data.package_name,
                description: data.description || null,
                total_amount: data.total_amount,
                validity_days: data.validity_days || 7,
                inclusions: data.inclusions,
                exclusions: data.exclusions || null,
                organizationId,
            },
        });
        await logAudit({
            action: 'CREATE_IPD_PACKAGE',
            module: 'ipd',
            entity_type: 'ipd_package',
            entity_id: String(pkg.id),
            details: JSON.stringify({ package_code: data.package_code, total_amount: data.total_amount }),
        });
        return { success: true, data: serialize(pkg) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updateIpdPackage(id: number, data: {
    package_name?: string;
    description?: string;
    total_amount?: number;
    validity_days?: number;
    inclusions?: any[];
    exclusions?: string;
    is_active?: boolean;
}) {
    try {
        const { db } = await requireTenantContext();
        const pkg = await db.ipdPackage.update({ where: { id }, data });
        return { success: true, data: serialize(pkg) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getPackageDetail(packageId: number) {
    try {
        const { db } = await requireTenantContext();
        const pkg = await db.ipdPackage.findUnique({
            where: { id: packageId },
        });
        if (!pkg) return { success: false, error: 'Package not found' };
        return { success: true, data: serialize(pkg) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
