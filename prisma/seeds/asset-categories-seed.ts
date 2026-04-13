import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed default asset categories for hospital
 * Run with: npx ts-node prisma/seeds/asset-categories-seed.ts
 */
export async function seedAssetCategories(organizationId: string) {
  console.log('Seeding asset categories for organization:', organizationId);

  // First, get or create necessary GL accounts for assets
  // These should be created by the COA seed first

  const assetCategories = [
    {
      category_name: 'Medical Equipment',
      category_code: 'MED-EQP',
      asset_type: 'Tangible',
      depreciation_method: 'WDV',
      depreciation_rate: 15.0,
      useful_life_years: 10,
      description: 'Medical equipment including diagnostic machines, surgical instruments, patient monitoring systems',
    },
    {
      category_name: 'IT Equipment',
      category_code: 'IT-EQP',
      asset_type: 'Tangible',
      depreciation_method: 'WDV',
      depreciation_rate: 40.0,
      useful_life_years: 3,
      description: 'Computers, servers, networking equipment, software, tablets, printers',
    },
    {
      category_name: 'Furniture & Fixtures',
      category_code: 'FURN',
      asset_type: 'Tangible',
      depreciation_method: 'SLM',
      depreciation_rate: 10.0,
      useful_life_years: 10,
      description: 'Office furniture, patient room furniture, waiting area furniture, fixtures',
    },
    {
      category_name: 'Vehicles',
      category_code: 'VEH',
      asset_type: 'Tangible',
      depreciation_method: 'WDV',
      depreciation_rate: 15.0,
      useful_life_years: 8,
      description: 'Ambulances, staff vehicles, delivery vehicles',
    },
    {
      category_name: 'Building',
      category_code: 'BLDG',
      asset_type: 'Tangible',
      depreciation_method: 'SLM',
      depreciation_rate: 5.0,
      useful_life_years: 20,
      description: 'Hospital building, infrastructure, permanent structures',
    },
    {
      category_name: 'Laboratory Equipment',
      category_code: 'LAB-EQP',
      asset_type: 'Tangible',
      depreciation_method: 'WDV',
      depreciation_rate: 15.0,
      useful_life_years: 8,
      description: 'Lab analyzers, microscopes, centrifuges, reagent storage',
    },
    {
      category_name: 'Radiology Equipment',
      category_code: 'RAD-EQP',
      asset_type: 'Tangible',
      depreciation_method: 'WDV',
      depreciation_rate: 15.0,
      useful_life_years: 10,
      description: 'X-ray machines, CT scanners, MRI machines, ultrasound systems',
    },
    {
      category_name: 'Operation Theater Equipment',
      category_code: 'OT-EQP',
      asset_type: 'Tangible',
      depreciation_method: 'WDV',
      depreciation_rate: 15.0,
      useful_life_years: 10,
      description: 'OT tables, anesthesia machines, surgical lights, ventilators',
    },
    {
      category_name: 'Patient Care Equipment',
      category_code: 'PC-EQP',
      asset_type: 'Tangible',
      depreciation_method: 'WDV',
      depreciation_rate: 20.0,
      useful_life_years: 5,
      description: 'Hospital beds, wheelchairs, stretchers, patient monitors',
    },
    {
      category_name: 'HVAC & Utilities',
      category_code: 'HVAC',
      asset_type: 'Tangible',
      depreciation_method: 'SLM',
      depreciation_rate: 10.0,
      useful_life_years: 10,
      description: 'Air conditioning, heating systems, generators, UPS, electrical panels',
    },
    {
      category_name: 'Software & Licenses',
      category_code: 'SOFT',
      asset_type: 'Intangible',
      depreciation_method: 'SLM',
      depreciation_rate: 33.33,
      useful_life_years: 3,
      description: 'Hospital management software, licenses, digital assets',
    },
    {
      category_name: 'Leasehold Improvements',
      category_code: 'LEASE',
      asset_type: 'Tangible',
      depreciation_method: 'SLM',
      depreciation_rate: 10.0,
      useful_life_years: 10,
      description: 'Improvements to leased property, renovations, build-outs',
    },
  ];

  // Try to find GL accounts for asset category mapping
  // These account codes should match the COA seed
  const fixedAssetsAccount = await prisma.gL_Account.findFirst({
    where: {
      organizationId,
      account_code: '2200', // Medical Equipment from COA
    },
  });

  const accDepreciationAccount = await prisma.gL_Account.findFirst({
    where: {
      organizationId,
      account_code: '2600', // Accumulated Depreciation
    },
  });

  const depreciationExpenseAccount = await prisma.gL_Account.findFirst({
    where: {
      organizationId,
      account_code: '8900', // Depreciation Expense
    },
  });

  console.log('Found GL accounts:');
  console.log('- Fixed Assets:', fixedAssetsAccount?.account_name);
  console.log('- Accumulated Depreciation:', accDepreciationAccount?.account_name);
  console.log('- Depreciation Expense:', depreciationExpenseAccount?.account_name);

  let created = 0;
  let skipped = 0;

  for (const category of assetCategories) {
    try {
      // Check if category already exists
      const existing = await prisma.assetCategory.findFirst({
        where: {
          organizationId,
          category_code: category.category_code,
        },
      });

      if (existing) {
        console.log(`Category ${category.category_code} already exists, skipping`);
        skipped++;
        continue;
      }

      await prisma.assetCategory.create({
        data: {
          organizationId,
          category_name: category.category_name,
          category_code: category.category_code,
          asset_type: category.asset_type,
          depreciation_method: category.depreciation_method,
          depreciation_rate: category.depreciation_rate,
          useful_life_years: category.useful_life_years,
          // Map to GL accounts if found
          gl_asset_account_id: fixedAssetsAccount?.id,
          gl_depreciation_account_id: accDepreciationAccount?.id,
          gl_expense_account_id: depreciationExpenseAccount?.id,
        },
      });

      console.log(`✓ Created category: ${category.category_name} (${category.depreciation_method} ${category.depreciation_rate}%)`);
      created++;
    } catch (error: any) {
      console.error(`Error creating category ${category.category_code}:`, error.message);
    }
  }

  console.log(`\nAsset Categories Seed Summary:`);
  console.log(`- Created: ${created}`);
  console.log(`- Skipped: ${skipped}`);
  console.log(`- Total: ${assetCategories.length}`);

  return { created, skipped, total: assetCategories.length };
}

// Run if called directly
if (require.main === module) {
  const organizationId = process.argv[2];

  if (!organizationId) {
    console.error('Usage: npx ts-node prisma/seeds/asset-categories-seed.ts <organizationId>');
    process.exit(1);
  }

  seedAssetCategories(organizationId)
    .then(() => {
      console.log('Asset categories seed completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Asset categories seed failed:', error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
