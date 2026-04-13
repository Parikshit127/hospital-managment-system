// @ts-nocheck
'use server';

import { prisma } from '@/backend/db';
import { postDepreciationToGL } from './gl-actions';

// ============================================
// ASSET CATEGORY MANAGEMENT
// ============================================

export async function createAssetCategory(data: {
  organizationId: string;
  category_name: string;
  category_code: string;
  asset_type: string;
  depreciation_method: string;
  depreciation_rate: number;
  useful_life_years?: number;
  gl_asset_account_id?: string;
  gl_depreciation_account_id?: string;
  gl_expense_account_id?: string;
}) {
  try {
    const category = await prisma.assetCategory.create({
      data: {
        organizationId: data.organizationId,
        category_name: data.category_name,
        category_code: data.category_code,
        asset_type: data.asset_type,
        depreciation_method: data.depreciation_method,
        depreciation_rate: data.depreciation_rate,
        useful_life_years: data.useful_life_years,
        gl_asset_account_id: data.gl_asset_account_id,
        gl_depreciation_account_id: data.gl_depreciation_account_id,
        gl_expense_account_id: data.gl_expense_account_id,
      },
    });

    return { success: true, category };
  } catch (error: any) {
    console.error('Create asset category error:', error);
    return { success: false, error: error.message };
  }
}

export async function updateAssetCategory(
  id: string,
  data: {
    category_name?: string;
    asset_type?: string;
    depreciation_method?: string;
    depreciation_rate?: number;
    useful_life_years?: number;
    gl_asset_account_id?: string;
    gl_depreciation_account_id?: string;
    gl_expense_account_id?: string;
    is_active?: boolean;
  }
) {
  try {
    const category = await prisma.assetCategory.update({
      where: { id },
      data,
    });

    return { success: true, category };
  } catch (error: any) {
    console.error('Update asset category error:', error);
    return { success: false, error: error.message };
  }
}

export async function getAssetCategories(organizationId: string, filters?: { is_active?: boolean }) {
  try {
    const categories = await prisma.assetCategory.findMany({
      where: {
        organizationId,
        ...(filters?.is_active !== undefined && { is_active: filters.is_active }),
      },
      include: {
        _count: {
          select: { assets: true },
        },
      },
      orderBy: { category_code: 'asc' },
    });

    return { success: true, categories };
  } catch (error: any) {
    console.error('Get asset categories error:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// FIXED ASSET MANAGEMENT
// ============================================

export async function createFixedAsset(data: {
  organizationId: string;
  asset_code: string;
  asset_name: string;
  category_id: string;
  description?: string;
  location?: string;
  department?: string;
  acquisition_date: Date;
  acquisition_cost: number;
  vendor_id?: number;
  invoice_number?: string;
  warranty_expiry?: Date;
  depreciation_method: string;
  depreciation_rate: number;
  salvage_value?: number;
  serial_number?: string;
  manufacturer?: string;
  model_number?: string;
  is_capitalized?: boolean;
  capitalization_date?: Date;
}) {
  try {
    const salvageValue = data.salvage_value || 0;
    const bookValue = data.acquisition_cost - salvageValue;

    const asset = await prisma.fixedAsset.create({
      data: {
        organizationId: data.organizationId,
        asset_code: data.asset_code,
        asset_name: data.asset_name,
        category_id: data.category_id,
        description: data.description,
        location: data.location,
        department: data.department,
        acquisition_date: data.acquisition_date,
        acquisition_cost: data.acquisition_cost,
        vendor_id: data.vendor_id,
        invoice_number: data.invoice_number,
        warranty_expiry: data.warranty_expiry,
        depreciation_method: data.depreciation_method,
        depreciation_rate: data.depreciation_rate,
        salvage_value: salvageValue,
        accumulated_depreciation: 0,
        book_value: bookValue,
        serial_number: data.serial_number,
        manufacturer: data.manufacturer,
        model_number: data.model_number,
        is_capitalized: data.is_capitalized ?? true,
        capitalization_date: data.capitalization_date || data.acquisition_date,
      },
      include: {
        category: true,
        vendor: true,
      },
    });

    return { success: true, asset };
  } catch (error: any) {
    console.error('Create fixed asset error:', error);
    return { success: false, error: error.message };
  }
}

export async function updateFixedAsset(
  id: string,
  data: {
    asset_name?: string;
    description?: string;
    location?: string;
    department?: string;
    warranty_expiry?: Date;
    maintenance_schedule?: string;
    serial_number?: string;
    manufacturer?: string;
    model_number?: string;
  }
) {
  try {
    const asset = await prisma.fixedAsset.update({
      where: { id },
      data,
      include: {
        category: true,
        vendor: true,
      },
    });

    return { success: true, asset };
  } catch (error: any) {
    console.error('Update fixed asset error:', error);
    return { success: false, error: error.message };
  }
}

export async function getFixedAssets(
  organizationId: string,
  filters?: {
    status?: string;
    category_id?: string;
    department?: string;
    location?: string;
  }
) {
  try {
    const assets = await prisma.fixedAsset.findMany({
      where: {
        organizationId,
        ...(filters?.status && { status: filters.status }),
        ...(filters?.category_id && { category_id: filters.category_id }),
        ...(filters?.department && { department: filters.department }),
        ...(filters?.location && { location: filters.location }),
      },
      include: {
        category: true,
        vendor: true,
      },
      orderBy: { asset_code: 'asc' },
    });

    return { success: true, assets };
  } catch (error: any) {
    console.error('Get fixed assets error:', error);
    return { success: false, error: error.message };
  }
}

export async function getAssetDetails(id: string) {
  try {
    const asset = await prisma.fixedAsset.findUnique({
      where: { id },
      include: {
        category: true,
        vendor: true,
        depreciation_entries: {
          orderBy: { period_start: 'desc' },
          take: 12,
        },
        transfers: {
          orderBy: { transfer_date: 'desc' },
          take: 10,
        },
        maintenance_records: {
          orderBy: { maintenance_date: 'desc' },
          take: 10,
        },
      },
    });

    if (!asset) {
      return { success: false, error: 'Asset not found' };
    }

    return { success: true, asset };
  } catch (error: any) {
    console.error('Get asset details error:', error);
    return { success: false, error: error.message };
  }
}

export async function disposeAsset(
  id: string,
  data: {
    disposal_date: Date;
    disposal_value: number;
    disposal_reason: string;
  }
) {
  try {
    const asset = await prisma.fixedAsset.update({
      where: { id },
      data: {
        status: 'Disposed',
        disposed_date: data.disposal_date,
        disposal_value: data.disposal_value,
        disposal_reason: data.disposal_reason,
      },
    });

    // TODO: Post disposal to GL (profit/loss on disposal)

    return { success: true, asset };
  } catch (error: any) {
    console.error('Dispose asset error:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// DEPRECIATION CALCULATION & POSTING
// ============================================

/**
 * Calculate depreciation for a single asset for a specific period
 * SLM: (Cost - Salvage) / Useful Life / 12 months
 * WDV: Book Value * Rate / 12 months
 */
export async function calculateDepreciation(assetId: string, period: string) {
  try {
    const asset = await prisma.fixedAsset.findUnique({
      where: { id: assetId },
      include: { category: true },
    });

    if (!asset || asset.status !== 'Active') {
      return { success: false, error: 'Asset not found or not active' };
    }

    // Parse period (MMYYYY)
    const month = parseInt(period.substring(0, 2));
    const year = parseInt(period.substring(2, 6));
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0); // Last day of month

    // Check if asset was acquired before period end
    if (asset.acquisition_date > periodEnd) {
      return { success: false, error: 'Asset not yet acquired in this period' };
    }

    const openingBookValue = parseFloat(asset.book_value.toString());
    let depreciationAmount = 0;

    if (asset.depreciation_method === 'SLM') {
      // Straight Line Method
      const depreciableValue = parseFloat(asset.acquisition_cost.toString()) - parseFloat(asset.salvage_value.toString());
      const usefulLifeYears = asset.category.useful_life_years || 5;
      depreciationAmount = depreciableValue / usefulLifeYears / 12;
    } else if (asset.depreciation_method === 'WDV') {
      // Written Down Value Method
      const rate = parseFloat(asset.depreciation_rate.toString()) / 100;
      depreciationAmount = openingBookValue * rate / 12;
    }

    // Round to 2 decimal places
    depreciationAmount = Math.round(depreciationAmount * 100) / 100;

    const accumulatedDepreciation = parseFloat(asset.accumulated_depreciation.toString()) + depreciationAmount;
    const closingBookValue = openingBookValue - depreciationAmount;

    return {
      success: true,
      depreciation: {
        asset_id: assetId,
        depreciation_period: period,
        period_start: periodStart,
        period_end: periodEnd,
        opening_book_value: openingBookValue,
        depreciation_amount: depreciationAmount,
        accumulated_depreciation: accumulatedDepreciation,
        closing_book_value: closingBookValue,
        calculation_method: asset.depreciation_method,
      },
    };
  } catch (error: any) {
    console.error('Calculate depreciation error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Post monthly depreciation for all active assets
 */
export async function postMonthlyDepreciation(organizationId: string, period: string) {
  try {
    const assets = await prisma.fixedAsset.findMany({
      where: {
        organizationId,
        status: 'Active',
        is_capitalized: true,
      },
    });

    const results = [];
    let totalDepreciation = 0;

    for (const asset of assets) {
      // Check if depreciation already exists for this period
      const existing = await prisma.depreciationEntry.findUnique({
        where: {
          asset_id_depreciation_period: {
            asset_id: asset.id,
            depreciation_period: period,
          },
        },
      });

      if (existing) {
        continue; // Skip if already posted
      }

      // Calculate depreciation
      const calcResult = await calculateDepreciation(asset.id, period);

      if (!calcResult.success || !calcResult.depreciation) {
        results.push({
          asset_id: asset.id,
          asset_name: asset.asset_name,
          success: false,
          error: calcResult.error,
        });
        continue;
      }

      const dep = calcResult.depreciation;

      // Create depreciation entry (Draft status initially)
      const depEntry = await prisma.depreciationEntry.create({
        data: {
          organizationId,
          asset_id: asset.id,
          depreciation_period: period,
          period_start: dep.period_start,
          period_end: dep.period_end,
          opening_book_value: dep.opening_book_value,
          depreciation_amount: dep.depreciation_amount,
          accumulated_depreciation: dep.accumulated_depreciation,
          closing_book_value: dep.closing_book_value,
          calculation_method: dep.calculation_method,
          status: 'Draft',
        },
      });

      // Update asset book value and accumulated depreciation
      await prisma.fixedAsset.update({
        where: { id: asset.id },
        data: {
          accumulated_depreciation: dep.accumulated_depreciation,
          book_value: dep.closing_book_value,
          last_depreciation_date: dep.period_end,
        },
      });

      // Post to GL: Dr. Depreciation Expense / Cr. Accumulated Depreciation
      const glResult = await postDepreciationToGL(depEntry.id);

      if (glResult.success && glResult.journal_id) {
        // Update depreciation entry with journal_id and mark as Posted
        await prisma.depreciationEntry.update({
          where: { id: depEntry.id },
          data: {
            journal_entry_id: glResult.journal_id,
            status: 'Posted',
          },
        });

        totalDepreciation += dep.depreciation_amount;

        results.push({
          asset_id: asset.id,
          asset_name: asset.asset_name,
          success: true,
          depreciation_amount: dep.depreciation_amount,
          journal_id: glResult.journal_id,
        });
      } else {
        results.push({
          asset_id: asset.id,
          asset_name: asset.asset_name,
          success: false,
          error: glResult.error || 'GL posting failed',
        });
      }
    }

    return {
      success: true,
      period,
      total_assets: assets.length,
      processed: results.filter((r: any) => r.success).length,
      failed: results.filter((r: any) => !r.success).length,
      total_depreciation: totalDepreciation,
      results,
    };
  } catch (error: any) {
    console.error('Post monthly depreciation error:', error);
    return { success: false, error: error.message };
  }
}

export async function getDepreciationSchedule(assetId: string) {
  try {
    const entries = await prisma.depreciationEntry.findMany({
      where: { asset_id: assetId },
      orderBy: { period_start: 'asc' },
    });

    return { success: true, entries };
  } catch (error: any) {
    console.error('Get depreciation schedule error:', error);
    return { success: false, error: error.message };
  }
}

export async function reverseDepreciation(entryId: string, reason: string) {
  try {
    const entry = await prisma.depreciationEntry.findUnique({
      where: { id: entryId },
      include: { asset: true },
    });

    if (!entry) {
      return { success: false, error: 'Depreciation entry not found' };
    }

    if (entry.status === 'Reversed') {
      return { success: false, error: 'Entry already reversed' };
    }

    // Reverse the asset book value
    await prisma.fixedAsset.update({
      where: { id: entry.asset_id },
      data: {
        accumulated_depreciation: {
          decrement: parseFloat(entry.depreciation_amount.toString()),
        },
        book_value: {
          increment: parseFloat(entry.depreciation_amount.toString()),
        },
      },
    });

    // Mark entry as reversed
    await prisma.depreciationEntry.update({
      where: { id: entryId },
      data: { status: 'Reversed' },
    });

    // TODO: Reverse GL journal entry if exists

    return { success: true };
  } catch (error: any) {
    console.error('Reverse depreciation error:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// ASSET TRANSFER & MAINTENANCE
// ============================================

export async function transferAsset(data: {
  organizationId: string;
  asset_id: string;
  from_location?: string;
  to_location?: string;
  from_department?: string;
  to_department?: string;
  transfer_date: Date;
  transfer_reason?: string;
  approved_by?: string;
}) {
  try {
    const transfer = await prisma.assetTransfer.create({
      data,
    });

    // Update asset location/department
    await prisma.fixedAsset.update({
      where: { id: data.asset_id },
      data: {
        location: data.to_location,
        department: data.to_department,
      },
    });

    return { success: true, transfer };
  } catch (error: any) {
    console.error('Transfer asset error:', error);
    return { success: false, error: error.message };
  }
}

export async function recordMaintenance(data: {
  organizationId: string;
  asset_id: string;
  maintenance_type: string;
  maintenance_date: Date;
  description?: string;
  cost?: number;
  vendor_id?: number;
  next_due_date?: Date;
  performed_by?: string;
}) {
  try {
    const maintenance = await prisma.assetMaintenance.create({
      data,
    });

    // Update asset next maintenance date
    if (data.next_due_date) {
      await prisma.fixedAsset.update({
        where: { id: data.asset_id },
        data: {
          last_maintenance_date: data.maintenance_date,
          next_maintenance_date: data.next_due_date,
        },
      });
    }

    return { success: true, maintenance };
  } catch (error: any) {
    console.error('Record maintenance error:', error);
    return { success: false, error: error.message };
  }
}

export async function getMaintenanceSchedule(organizationId: string, filters?: { overdue?: boolean }) {
  try {
    const now = new Date();

    const maintenance = await prisma.assetMaintenance.findMany({
      where: {
        organizationId,
        ...(filters?.overdue && {
          next_due_date: { lt: now },
        }),
      },
      include: {
        asset: true,
        vendor: true,
      },
      orderBy: { next_due_date: 'asc' },
    });

    return { success: true, maintenance };
  } catch (error: any) {
    console.error('Get maintenance schedule error:', error);
    return { success: false, error: error.message };
  }
}

export async function getOverdueMaintenance(organizationId: string) {
  try {
    const now = new Date();

    const assets = await prisma.fixedAsset.findMany({
      where: {
        organizationId,
        status: 'Active',
        next_maintenance_date: { lt: now },
      },
      include: {
        category: true,
        maintenance_records: {
          orderBy: { maintenance_date: 'desc' },
          take: 1,
        },
      },
    });

    return { success: true, assets };
  } catch (error: any) {
    console.error('Get overdue maintenance error:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// REPORTS
// ============================================

export async function getAssetRegister(organizationId: string, filters?: { status?: string }) {
  try {
    const assets = await prisma.fixedAsset.findMany({
      where: {
        organizationId,
        ...(filters?.status && { status: filters.status }),
      },
      include: {
        category: true,
        vendor: true,
      },
      orderBy: { asset_code: 'asc' },
    });

    const summary = {
      total_assets: assets.length,
      total_acquisition_cost: assets.reduce((sum: number, a: any) => sum + parseFloat(a.acquisition_cost.toString()), 0),
      total_accumulated_depreciation: assets.reduce((sum: number, a: any) => sum + parseFloat(a.accumulated_depreciation.toString()), 0),
      total_book_value: assets.reduce((sum: number, a: any) => sum + parseFloat(a.book_value.toString()), 0),
    };

    return { success: true, assets, summary };
  } catch (error: any) {
    console.error('Get asset register error:', error);
    return { success: false, error: error.message };
  }
}

export async function getDepreciationReport(organizationId: string, period: string) {
  try {
    const entries = await prisma.depreciationEntry.findMany({
      where: {
        organizationId,
        depreciation_period: period,
      },
      include: {
        asset: {
          include: { category: true },
        },
      },
      orderBy: { period_start: 'asc' },
    });

    const summary = {
      total_entries: entries.length,
      total_depreciation: entries.reduce((sum: number, e: any) => sum + parseFloat(e.depreciation_amount.toString()), 0),
    };

    return { success: true, entries, summary };
  } catch (error: any) {
    console.error('Get depreciation report error:', error);
    return { success: false, error: error.message };
  }
}

export async function getAssetValuationReport(organizationId: string, asOfDate: Date) {
  try {
    const assets = await prisma.fixedAsset.findMany({
      where: {
        organizationId,
        acquisition_date: { lte: asOfDate },
      },
      include: {
        category: true,
      },
    });

    // Group by category
    const byCategory = assets.reduce((acc: any, asset: any) => {
      const catName = asset.category.category_name;
      if (!acc[catName]) {
        acc[catName] = {
          count: 0,
          acquisition_cost: 0,
          accumulated_depreciation: 0,
          book_value: 0,
        };
      }
      acc[catName].count++;
      acc[catName].acquisition_cost += parseFloat(asset.acquisition_cost.toString());
      acc[catName].accumulated_depreciation += parseFloat(asset.accumulated_depreciation.toString());
      acc[catName].book_value += parseFloat(asset.book_value.toString());
      return acc;
    }, {});

    return { success: true, by_category: byCategory, assets };
  } catch (error: any) {
    console.error('Get asset valuation report error:', error);
    return { success: false, error: error.message };
  }
}

export async function getDepartmentWiseAssets(organizationId: string) {
  try {
    const assets = await prisma.fixedAsset.findMany({
      where: { organizationId, status: 'Active' },
      include: { category: true },
    });

    // Group by department
    const byDepartment = assets.reduce((acc: any, asset: any) => {
      const dept = asset.department || 'Unassigned';
      if (!acc[dept]) {
        acc[dept] = {
          count: 0,
          book_value: 0,
          assets: [],
        };
      }
      acc[dept].count++;
      acc[dept].book_value += parseFloat(asset.book_value.toString());
      acc[dept].assets.push(asset);
      return acc;
    }, {});

    return { success: true, by_department: byDepartment };
  } catch (error: any) {
    console.error('Get department-wise assets error:', error);
    return { success: false, error: error.message };
  }
}
