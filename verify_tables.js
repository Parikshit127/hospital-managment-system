const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Connecting to Supabase to verify schema...");

    // 1. List all tables
    const tables = await prisma.$queryRaw`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `;

    console.log(`\nFound ${tables.length} tables in the database:`);

    for (const t of tables) {
        if (t.table_name.startsWith('_')) continue; // Skip Prisma internal tables

        console.log(`\n[TABLE] ${t.table_name}`);

        // 2. List columns for each table
        const columns = await prisma.$queryRaw`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = ${t.table_name}
        ORDER BY ordinal_position;
    `;

        // Simple print format
        columns.forEach(c => {
            console.log(`  - ${c.column_name} (${c.data_type}) ${c.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
        });
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
