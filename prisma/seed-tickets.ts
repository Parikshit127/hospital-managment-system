import { PrismaClient, TicketPriority, TicketStatus } from '@prisma/client';

const prisma = new PrismaClient();

interface DummyTicket {
    title: string;
    description: string;
    priority: TicketPriority;
    status: TicketStatus;
}

const DUMMY_TICKETS: readonly DummyTicket[] = [
    {
        title: 'Cannot access pharmacy module',
        description:
            'Pharmacist reports a 403 error when opening the Pharmacy dashboard after the latest deployment. Other modules load normally.',
        priority: TicketPriority.High,
        status: TicketStatus.Open,
    },
    {
        title: 'Reset password for Dr. Smith',
        description:
            'Dr. Smith is locked out after multiple failed login attempts and needs an admin-initiated password reset to resume OPD consultations.',
        priority: TicketPriority.Medium,
        status: TicketStatus.InProgress,
    },
    {
        title: 'Billing page crash on invoice finalize',
        description:
            'Reception staff hit a white screen when finalizing an IPD invoice with more than 20 line items. Console shows an unhandled exception.',
        priority: TicketPriority.Critical,
        status: TicketStatus.Open,
    },
    {
        title: 'Lab report PDF export missing logo',
        description:
            'Generated lab report PDFs no longer include the hospital branding/logo in the header since the branding settings were updated.',
        priority: TicketPriority.Low,
        status: TicketStatus.Resolved,
    },
    {
        title: 'Appointment slots not syncing to doctor calendar',
        description:
            'Newly booked OPD appointments are not appearing on the assigned doctor calendar view until a manual page refresh is performed.',
        priority: TicketPriority.Medium,
        status: TicketStatus.Open,
    },
    {
        title: 'Tally export fails for previous financial year',
        description:
            'Finance team gets a "voucher type not mapped" error when exporting transactions dated before the current financial year to Tally.',
        priority: TicketPriority.High,
        status: TicketStatus.InProgress,
    },
    {
        title: 'WhatsApp appointment reminders not delivered',
        description:
            'Patients report not receiving WhatsApp appointment reminders. Integration logs show messages queued but never marked as sent.',
        priority: TicketPriority.High,
        status: TicketStatus.Resolved,
    },
    {
        title: 'Slow patient search in registration screen',
        description:
            'Searching for existing patients by phone number in the registration screen takes 8-10 seconds for organizations with large patient lists.',
        priority: TicketPriority.Medium,
        status: TicketStatus.Open,
    },
    {
        title: 'Discharge summary template formatting broken',
        description:
            'Structured discharge summaries render with overlapping sections when printed, making them unreadable for some bed transfers.',
        priority: TicketPriority.Low,
        status: TicketStatus.InProgress,
    },
    {
        title: 'MFA setup QR code not scanning',
        description:
            'Several users report the multi-factor authentication QR code fails to scan in authenticator apps during initial security setup.',
        priority: TicketPriority.Critical,
        status: TicketStatus.Open,
    },
];

async function main(): Promise<void> {
    console.log('Seeding dummy tickets ...');

    // 1. Find an existing user to own the tickets.
    const user = await prisma.user.findFirst({
        select: { id: true, organizationId: true, name: true, username: true },
    });

    if (!user) {
        console.error(
            'No User found. Create at least one user (and organization) before seeding tickets.',
        );
        process.exit(1);
    }

    // 2. Find a Branch in the same organization; fall back to any branch.
    const branch =
        (await prisma.branch.findFirst({
            where: { organizationId: user.organizationId },
            select: { id: true, branch_name: true },
        })) ??
        (await prisma.branch.findFirst({
            select: { id: true, branch_name: true },
        }));

    if (!branch) {
        console.error(
            'No Branch found. Create at least one branch before seeding tickets.',
        );
        process.exit(1);
    }

    console.log(
        `Attaching tickets to user "${user.name ?? user.username}" and branch "${branch.branch_name}".`,
    );

    // 3. Insert the dummy tickets.
    const result = await prisma.ticket.createMany({
        data: DUMMY_TICKETS.map((ticket) => ({
            title: ticket.title,
            description: ticket.description,
            priority: ticket.priority,
            status: ticket.status,
            user_id: user.id,
            branch_id: branch.id,
            organizationId: user.organizationId,
        })),
    });

    console.log(`Seeded ${result.count} dummy tickets.`);
}

main()
    .catch((error) => {
        console.error('Ticket seed failed:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
