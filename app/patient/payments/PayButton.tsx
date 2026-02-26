'use client';

import { useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';

// window.Razorpay is defined in app/types/razorpay.d.ts

interface PayButtonProps {
    invoiceId: string;
    amount: number;
}

export default function PayButton({ invoiceId, amount }: PayButtonProps) {
    const [loading, setLoading] = useState(false);

    async function handlePay() {
        setLoading(true);
        try {
            // Create Razorpay order
            const res = await fetch('/api/razorpay/create-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ invoiceId, amount }),
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Order creation failed (${res.status}): ${text}`);
            }

            const data = await res.json();
            if (!data.orderId) {
                alert(data.error || 'Failed to create payment order');
                return;
            }

            // Load Razorpay if not already loaded
            if (!window.Razorpay) {
                const script = document.createElement('script');
                script.src = 'https://checkout.razorpay.com/v1/checkout.js';
                script.async = true;
                document.body.appendChild(script);
                await new Promise(resolve => script.onload = resolve);
            }

            const options = {
                key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || data.keyId,
                amount: amount * 100,
                currency: 'INR',
                name: 'Hospital OS',
                description: `Payment for ${invoiceId}`,
                order_id: data.orderId,
                handler: async function (response: any) {
                    // Verify payment
                    const verifyRes = await fetch('/api/razorpay/verify-payment', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            invoiceId,
                        }),
                    });

                    const verifyData = await verifyRes.json();
                    if (verifyData.success) {
                        alert('Payment successful!');
                        window.location.reload();
                    } else {
                        alert('Payment verification failed. Please contact support.');
                    }
                },
                theme: { color: '#10b981' },
            };

            const rzp = new window.Razorpay(options);
            rzp.open();
        } catch (err) {
            console.error('Payment error:', err);
            alert('Payment initiation failed.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <button
            onClick={handlePay}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm rounded-xl transition disabled:opacity-50 shadow-lg shadow-emerald-500/20"
        >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            {loading ? 'Processing…' : 'Pay Now'}
        </button>
    );
}
