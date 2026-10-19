/**
 * Create (or reset the password of) a Super Admin portal login.
 *
 * Runs against whatever DATABASE_URL is in the environment / .env, so on the
 * hosted server it hits the hosted DB. Credentials come from the command line
 * so no password is committed to the repo.
 *
 *   npx tsx scripts/create-superadmin.ts <loginId> <password> ["Display Name"]
 *
 * <loginId> is stored in super_admins.email and is what you type in the
 * Super Admin login form (an email or a plain username). Case-sensitive.
 */
import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const [loginId, password, displayName] = process.argv.slice(2);
    if (!loginId || !password) {
        console.error('Usage: npx tsx scripts/create-superadmin.ts <loginId> <password> ["Display Name"]');
        process.exit(1);
    }

    const hash = await bcrypt.hash(password, 10);
    const existing = await prisma.superAdmin.findUnique({ where: { email: loginId } });

    if (existing) {
        await prisma.superAdmin.update({
            where: { id: existing.id },
            data: { password: hash, is_active: true },
        });
        console.log(`Updated existing Super Admin "${loginId}" (password reset, account active).`);
    } else {
        const created = await prisma.superAdmin.create({
            data: { email: loginId, password: hash, name: displayName || loginId, is_active: true },
        });
        console.log(`Created Super Admin "${created.email}" (id ${created.id}).`);
    }
}

main()
    .catch(err => {
        console.error('Failed:', err.message);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
