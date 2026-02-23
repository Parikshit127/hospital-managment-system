
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
    console.log('Reading migration.sql...');
    const sqlPath = path.join(__dirname, '..', 'migration.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    // Split by semicolon to run statements individually (basic split)
    // Supabase might handle the big block, but safer to split if needed.
    // Actually, Prisma executeRaw might accept the whole block.
    // Let's try executing the whole block first.

    console.log('Executing SQL schema update...');
    try {
        await prisma.$executeRawUnsafe(sql);
        console.log('Schema deployed successfully!');
    } catch (e) {
        console.error('Error executing SQL:', e);
        // Fallback: simple split (naive)
        console.log('Retrying with naive split...');
        const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
        for (const stmt of statements) {
            try {
                await prisma.$executeRawUnsafe(stmt);
            } catch (err) {
                console.error('Failed stmt:', stmt.substring(0, 50) + '...', err.message);
            }
        }
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
