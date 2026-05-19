import { prisma } from '../backend/db';
import * as bcrypt from 'bcryptjs';

async function test() {
    try {
        const username = 'admin'; // just to see if DB is reachable
        const user = await prisma.user.findUnique({ where: { username } });
        console.log('User:', user?.username);
    } catch (e) {
        console.error('Error:', e);
    }
}
test();
