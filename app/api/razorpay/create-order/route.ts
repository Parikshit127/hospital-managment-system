import { NextRequest, NextResponse } from 'next/server';
import razorpay from '@/app/lib/razorpay';
import { prisma } from '@/backend/db';
import { resolveRouteAuth } from '@/app/lib/route-auth';

const ALLOWED_STAFF_ROLES = ['admin', 'finance', 'receptionist'];

export async function POST(req: NextRequest) {
    try {
        const auth = await resolveRouteAuth({
            allowPatient: true,
            allowedStaffRoles: ALLOWED_STAFF_ROLES,
        });
        if (!auth.ok) return auth.response;

        const body = await req.json();
        const invoiceIdRaw = body.invoice_id ?? body.invoiceId;
        const invoiceId = Number(invoiceIdRaw);

        if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
            return NextResponse.json(
                { success: false, error: 'invoice_id is required' },
                { status: 400 }
            );
        }

        const invoice = await prisma.invoices.findFirst({
            where: {
                id: invoiceId,
                organizationId: auth.context.organizationId,
            },
            include: {
                patient: {
                    select: {
                        full_name: true,
                    },
                },
            },
        });

        if (!invoice) {
            return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
        }

        if (auth.context.kind === 'patient' && invoice.patient_id !== auth.context.session.id) {
            return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
        }

        const amount = Number(invoice.balance_due ?? 0);
        if (amount <= 0) {
            return NextResponse.json({ success: false, error: 'Invoice balance already settled' }, { status: 400 });
        }

        // Razorpay expects amount in paise (1 INR = 100 paise)
        const amountInPaise = Math.round(amount * 100);

        const order = await razorpay.orders.create({
            amount: amountInPaise,
            currency: 'INR',
            receipt: `rcpt_inv_${invoiceId}_${Date.now()}`,
            notes: {
                invoice_id: String(invoiceId),
                invoice_number: invoice.invoice_number,
                patient_name: invoice.patient?.full_name || '',
                organization_id: auth.context.organizationId,
            },
        });

        await prisma.paymentOrderIntent.create({
            data: {
                razorpay_order_id: order.id,
                invoice_id: invoice.id,
                expected_amount: invoice.balance_due,
                status: 'created',
                organizationId: auth.context.organizationId,
                created_by:
                    auth.context.kind === 'staff'
                        ? auth.context.session.id
                        : auth.context.session.id,
                expires_at: new Date(Date.now() + 1000 * 60 * 15),
            },
        });

        return NextResponse.json({
            success: true,
            data: {
                order_id: order.id,
                amount: order.amount,
                currency: order.currency,
                key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
            },
            orderId: order.id,
            keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        });
    } catch (error: any) {
        console.error('Razorpay create-order error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to create order' },
            { status: 500 }
        );
    }
}
