import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/backend/db';
import { resolveRouteAuth } from '@/app/lib/route-auth';

const ALLOWED_STAFF_ROLES = ['admin', 'finance', 'receptionist'];

function generateReceiptNumber() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
    return `RCP-${dateStr}-${seq}`;
}

export async function POST(req: NextRequest) {
    try {
        const auth = await resolveRouteAuth({
            allowPatient: true,
            allowedStaffRoles: ALLOWED_STAFF_ROLES,
        });
        if (!auth.ok) return auth.response;

        const body = await req.json();
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            invoice_id,
            amount,
            payment_type,
            notes,
        } = body;

        const invoiceId = Number(invoice_id);

        // 1. Validate required fields
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !Number.isInteger(invoiceId)) {
            return NextResponse.json(
                { success: false, error: 'Missing required payment fields' },
                { status: 400 }
            );
        }

        // 2. Verify HMAC SHA256 signature
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            console.error('Razorpay signature mismatch');
            return NextResponse.json(
                { success: false, error: 'Payment verification failed: invalid signature' },
                { status: 400 }
            );
        }

        // 3. Idempotency — prevent double-recording
        const existingPayment = await prisma.payments.findFirst({
            where: {
                razorpay_payment_id,
                organizationId: auth.context.organizationId,
            },
        });

        if (existingPayment) {
            return NextResponse.json({
                success: true,
                data: existingPayment,
                message: 'Payment already recorded',
            });
        }

        const [invoice, orderIntent] = await Promise.all([
            prisma.invoices.findFirst({
                where: {
                    id: invoiceId,
                    organizationId: auth.context.organizationId,
                },
            }),
            prisma.paymentOrderIntent.findFirst({
                where: {
                    razorpay_order_id,
                    invoice_id: invoiceId,
                    organizationId: auth.context.organizationId,
                    status: 'created',
                },
            }),
        ]);

        if (!invoice) {
            return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
        }

        if (auth.context.kind === 'patient' && invoice.patient_id !== auth.context.session.id) {
            return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
        }

        if (!orderIntent) {
            return NextResponse.json(
                { success: false, error: 'Payment order intent not found or expired' },
                { status: 400 }
            );
        }

        if (orderIntent.expires_at < new Date()) {
            await prisma.paymentOrderIntent.update({
                where: { razorpay_order_id },
                data: { status: 'expired' },
            });
            return NextResponse.json({ success: false, error: 'Payment order expired' }, { status: 400 });
        }

        const expectedAmount = Number(orderIntent.expected_amount);
        if (typeof amount !== 'undefined' && Number(amount) !== expectedAmount) {
            return NextResponse.json(
                { success: false, error: 'Amount mismatch detected' },
                { status: 400 }
            );
        }

        // 4. Record the payment + invoice update atomically
        const payment = await prisma.$transaction(async (tx) => {
            const createdPayment = await tx.payments.create({
                data: {
                    receipt_number: generateReceiptNumber(),
                    invoice_id: invoiceId,
                    amount: orderIntent.expected_amount,
                    payment_method: 'Razorpay',
                    payment_type: payment_type || 'Settlement',
                    razorpay_order_id,
                    razorpay_payment_id,
                    status: 'Completed',
                    notes: notes || 'Paid via Razorpay',
                    organizationId: auth.context.organizationId,
                },
            });

            const allPayments = await tx.payments.findMany({
                where: {
                    invoice_id: invoiceId,
                    status: 'Completed',
                    organizationId: auth.context.organizationId,
                },
            });

            const totalPaid = allPayments.reduce((sum, paymentRow) => sum + Number(paymentRow.amount), 0);
            const netAmount = Number(invoice.net_amount || 0);
            const balance = netAmount - totalPaid;

            let newStatus = invoice.status || 'Draft';
            if (balance <= 0) newStatus = 'Paid';
            else if (totalPaid > 0) newStatus = 'Partial';

            await tx.invoices.update({
                where: { id: invoiceId },
                data: {
                    paid_amount: totalPaid,
                    balance_due: balance > 0 ? balance : 0,
                    status: newStatus,
                },
            });

            await tx.paymentOrderIntent.update({
                where: { razorpay_order_id },
                data: {
                    status: 'verified',
                    verified_at: new Date(),
                },
            });

            return createdPayment;
        });

        // 6. Audit log
        await prisma.system_audit_logs.create({
            data: {
                action: 'RAZORPAY_PAYMENT_VERIFIED',
                module: 'finance',
                entity_type: 'payment',
                entity_id: payment.receipt_number,
                details: JSON.stringify({
                    invoice_id: invoiceId,
                    amount: expectedAmount,
                    razorpay_order_id,
                    razorpay_payment_id,
                }),
                organizationId: auth.context.organizationId,
            },
        });

        return NextResponse.json({ success: true, data: payment });
    } catch (error: any) {
        console.error('Razorpay verify-payment error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Payment verification failed' },
            { status: 500 }
        );
    }
}
