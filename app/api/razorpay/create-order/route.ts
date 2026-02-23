import { NextRequest, NextResponse } from 'next/server';
import razorpay from '@/app/lib/razorpay';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { amount, invoice_id, invoice_number, patient_name } = body;

        if (!amount || !invoice_id) {
            return NextResponse.json(
                { success: false, error: 'amount and invoice_id are required' },
                { status: 400 }
            );
        }

        // Razorpay expects amount in paise (1 INR = 100 paise)
        const amountInPaise = Math.round(amount * 100);

        const order = await razorpay.orders.create({
            amount: amountInPaise,
            currency: 'INR',
            receipt: `rcpt_inv_${invoice_id}_${Date.now()}`,
            notes: {
                invoice_id: String(invoice_id),
                invoice_number: invoice_number || '',
                patient_name: patient_name || '',
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
        });
    } catch (error: any) {
        console.error('Razorpay create-order error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to create order' },
            { status: 500 }
        );
    }
}
