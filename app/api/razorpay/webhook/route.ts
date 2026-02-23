import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/app/lib/db';

function generateReceiptNumber() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
    return `RCP-${dateStr}-${seq}`;
}

export async function POST(req: NextRequest) {
    try {
        // 1. Get raw body for signature verification
        const rawBody = await req.text();
        const signature = req.headers.get('x-razorpay-signature');

        if (!signature) {
            return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
        }

        // 2. Verify webhook signature
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!)
            .update(rawBody)
            .digest('hex');

        if (expectedSignature !== signature) {
            console.error('Webhook signature mismatch');
            return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
        }

        // 3. Parse the event
        const event = JSON.parse(rawBody);

        // Only handle payment.captured events
        if (event.event !== 'payment.captured') {
            return NextResponse.json({ status: 'ignored', event: event.event });
        }

        const paymentEntity = event.payload.payment.entity;
        const razorpay_payment_id = paymentEntity.id;
        const razorpay_order_id = paymentEntity.order_id;
        const amountInRupees = paymentEntity.amount / 100;
        const invoiceId = paymentEntity.notes?.invoice_id;

        if (!invoiceId) {
            console.warn('Webhook: no invoice_id in payment notes, skipping');
            return NextResponse.json({ status: 'skipped', reason: 'no invoice_id' });
        }

        // 4. Idempotency check
        const existingPayment = await prisma.payments.findFirst({
            where: { razorpay_payment_id },
        });

        if (existingPayment) {
            return NextResponse.json({ status: 'already_recorded' });
        }

        // 5. Record payment
        const payment = await prisma.payments.create({
            data: {
                receipt_number: generateReceiptNumber(),
                invoice_id: Number(invoiceId),
                amount: amountInRupees,
                payment_method: 'Razorpay',
                payment_type: 'Settlement',
                razorpay_order_id,
                razorpay_payment_id,
                status: 'Completed',
                notes: 'Recorded via Razorpay webhook',
            },
        });

        // 6. Update invoice totals
        const allPayments = await prisma.payments.findMany({
            where: { invoice_id: Number(invoiceId), status: 'Completed' },
        });

        const totalPaid = allPayments.reduce((sum, p) => sum + Number(p.amount), 0);
        const invoice = await prisma.invoices.findUnique({ where: { id: Number(invoiceId) } });
        const netAmount = Number(invoice?.net_amount || 0);
        const balance = netAmount - totalPaid;

        let newStatus = invoice?.status || 'Draft';
        if (balance <= 0) newStatus = 'Paid';
        else if (totalPaid > 0) newStatus = 'Partial';

        await prisma.invoices.update({
            where: { id: Number(invoiceId) },
            data: {
                paid_amount: totalPaid,
                balance_due: balance > 0 ? balance : 0,
                status: newStatus,
            },
        });

        // 7. Audit log
        await prisma.system_audit_logs.create({
            data: {
                action: 'RAZORPAY_WEBHOOK_PAYMENT',
                module: 'finance',
                entity_type: 'payment',
                entity_id: payment.receipt_number,
                details: JSON.stringify({
                    event: event.event,
                    razorpay_payment_id,
                    razorpay_order_id,
                    amount: amountInRupees,
                    invoice_id: invoiceId,
                }),
            },
        });

        return NextResponse.json({ status: 'success', receipt: payment.receipt_number });
    } catch (error: any) {
        console.error('Razorpay webhook error:', error);
        return NextResponse.json(
            { error: error.message || 'Webhook processing failed' },
            { status: 500 }
        );
    }
}
