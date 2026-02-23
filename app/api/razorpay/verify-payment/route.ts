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

        // 1. Validate required fields
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !invoice_id || !amount) {
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
            where: { razorpay_payment_id },
        });

        if (existingPayment) {
            return NextResponse.json({
                success: true,
                data: existingPayment,
                message: 'Payment already recorded',
            });
        }

        // 4. Record the payment
        const payment = await prisma.payments.create({
            data: {
                receipt_number: generateReceiptNumber(),
                invoice_id: Number(invoice_id),
                amount: Number(amount),
                payment_method: 'Razorpay',
                payment_type: payment_type || 'Settlement',
                razorpay_order_id,
                razorpay_payment_id,
                status: 'Completed',
                notes: notes || 'Paid via Razorpay',
            },
        });

        // 5. Update invoice totals
        const allPayments = await prisma.payments.findMany({
            where: { invoice_id: Number(invoice_id), status: 'Completed' },
        });

        const totalPaid = allPayments.reduce((sum, p) => sum + Number(p.amount), 0);
        const invoice = await prisma.invoices.findUnique({ where: { id: Number(invoice_id) } });
        const netAmount = Number(invoice?.net_amount || 0);
        const balance = netAmount - totalPaid;

        let newStatus = invoice?.status || 'Draft';
        if (balance <= 0) newStatus = 'Paid';
        else if (totalPaid > 0) newStatus = 'Partial';

        await prisma.invoices.update({
            where: { id: Number(invoice_id) },
            data: {
                paid_amount: totalPaid,
                balance_due: balance > 0 ? balance : 0,
                status: newStatus,
            },
        });

        // 6. Audit log
        await prisma.system_audit_logs.create({
            data: {
                action: 'RAZORPAY_PAYMENT_VERIFIED',
                module: 'finance',
                entity_type: 'payment',
                entity_id: payment.receipt_number,
                details: JSON.stringify({
                    invoice_id,
                    amount,
                    razorpay_order_id,
                    razorpay_payment_id,
                }),
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
