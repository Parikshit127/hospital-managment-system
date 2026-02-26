const { prisma } = require('./backend/db');
(async () => {
    try {
        const admin = await prisma.superAdmin.findUnique({
            where: { email: 'superadmin@hospitalos.com' },
        });
        console.log(admin);
    } catch (e) {
        console.error(e);
    }
})();
