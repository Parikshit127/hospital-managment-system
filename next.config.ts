import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
    poweredByHeader: false,
    productionBrowserSourceMaps: false,
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: [
                    { key: 'X-Frame-Options', value: 'DENY' },
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
                    {
                        key: 'Content-Security-Policy',
                        value: [
                            "default-src 'self'",
                            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com",
                            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                            "font-src 'self' https://fonts.gstatic.com data: https:",
                            "img-src 'self' data: https:",
                            "connect-src 'self' https://*.supabase.co https://api.razorpay.com https://lumberjack-cx.razorpay.com",
                            "frame-src https://api.razorpay.com https://checkout.razorpay.com",
                        ].join('; ')
                    },
                    {
                        key: 'Strict-Transport-Security',
                        value: 'max-age=63072000; includeSubDomains; preload'
                    }
                ]
            }
        ]
    }
}

export default nextConfig
