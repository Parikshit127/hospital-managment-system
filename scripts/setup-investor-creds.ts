import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
    console.log('====================================================');
    console.log('🚀 HospitalOS - Investor Credentials Setup Script');
    console.log('====================================================\n');

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        console.error('❌ ERROR: DATABASE_URL environment variable is not set.');
        process.exit(1);
    }

    console.log(`📡 Target DB: ${dbUrl.replace(/:[^:@]+@/, ':****@')}`);

    // 1. Ensure investor_credentials table exists (Raw SQL for safe execution on any hosted DB)
    console.log('\n[1/3] Ensuring investor_credentials table exists...');
    try {
        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS investor_credentials (
                id VARCHAR(36) PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                is_temporary BOOLEAN DEFAULT FALSE,
                expires_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                created_by VARCHAR(255) DEFAULT 'system'
            );
        `);
        console.log('  ✓ Table investor_credentials verified / created.');
    } catch (err: any) {
        console.error('  ⚠️ Table creation notice:', err.message);
    }

    // 2. Setup static permanent investor credential: investor / inv@4321
    console.log('\n[2/3] Setting up permanent investor credentials...');
    const staticUsername = 'investor';
    const staticPassword = 'inv@4321';

    try {
        if ('investorCredential' in prisma && (prisma as any).investorCredential) {
            const existing = await (prisma as any).investorCredential.findFirst({
                where: { username: { equals: staticUsername, mode: 'insensitive' } },
            });

            if (existing) {
                await (prisma as any).investorCredential.update({
                    where: { id: existing.id },
                    data: {
                        password: staticPassword,
                        is_temporary: false,
                        expires_at: null,
                    },
                });
                console.log(`  ✓ Updated static credential: username="${staticUsername}", password="${staticPassword}"`);
            } else {
                await (prisma as any).investorCredential.create({
                    data: {
                        username: staticUsername,
                        password: staticPassword,
                        is_temporary: false,
                        created_by: 'seed_script',
                    },
                });
                console.log(`  ✓ Created static credential: username="${staticUsername}", password="${staticPassword}"`);
            }
        } else {
            // Raw SQL fallback if Prisma client not generated yet
            const id = crypto.randomUUID();
            await prisma.$executeRawUnsafe(
                `INSERT INTO investor_credentials (id, username, password, is_temporary, expires_at, created_by)
                 VALUES ($1, $2, $3, FALSE, NULL, 'seed_script')
                 ON CONFLICT (username) 
                 DO UPDATE SET password = EXCLUDED.password, is_temporary = FALSE, expires_at = NULL;`,
                id,
                staticUsername,
                staticPassword
            );
            console.log(`  ✓ Created/Updated static credential via Raw SQL: username="${staticUsername}", password="${staticPassword}"`);
        }
    } catch (err: any) {
        console.error('  ❌ Error setting up static credential:', err.message);
    }

    // 3. Optional: Create a 24-hour temporary credential if --temp flag is passed
    const shouldCreateTemp = process.argv.includes('--temp');
    if (shouldCreateTemp) {
        console.log('\n[3/3] Generating 24-hour temporary investor credential...');
        const tempSuffix = crypto.randomBytes(3).toString('hex');
        const tempUsername = `investor_temp_${tempSuffix}`;
        const tempPassword = `inv@${crypto.randomInt(1000, 9999)}`;
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const tempId = crypto.randomUUID();

        try {
            await prisma.$executeRawUnsafe(
                `INSERT INTO investor_credentials (id, username, password, is_temporary, expires_at, created_by)
                 VALUES ($1, $2, $3, TRUE, $4, 'cli_temp_flag');`,
                tempId,
                tempUsername,
                tempPassword,
                expiresAt.toISOString()
            );
            console.log(`  ✓ Temporary 24-Hour Credential Created!`);
            console.log(`    Username: ${tempUsername}`);
            console.log(`    Password: ${tempPassword}`);
            console.log(`    Expires:  ${expiresAt.toLocaleString()}`);
        } catch (err: any) {
            console.error('  ❌ Error creating temporary credential:', err.message);
        }
    } else {
        console.log('\n[3/3] Tip: Pass --temp flag to also generate a 24-hour temporary login.');
    }

    console.log('\n====================================================');
    console.log('✅ Investor credentials setup complete!');
    console.log('====================================================\n');
}

main()
    .catch((e) => {
        console.error('Setup script failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
