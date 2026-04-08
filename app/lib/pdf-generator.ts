import chromium from '@sparticuz/chromium';
import puppeteerCore from 'puppeteer-core';

/**
 * Convert HTML to PDF using Puppeteer
 * Optimized for Vercel deployments with @sparticuz/chromium
 */
export async function convertHtmlToPdf(html: string): Promise<Buffer> {
    let browser = null;

    try {
        // Use local chromium in development, @sparticuz/chromium in production
        const isDev = process.env.NODE_ENV !== 'production';

        if (isDev) {
            // In development, use full puppeteer package
            const puppeteer = await import('puppeteer');
            browser = await puppeteer.default.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            });
        } else {
            // In production, use puppeteer-core with @sparticuz/chromium
            // Optimize chromium for Vercel's serverless environment
            chromium.setGraphicsMode = false;

            browser = await puppeteerCore.launch({
                args: [
                    ...chromium.args,
                    '--disable-gpu',
                    '--disable-dev-shm-usage',
                    '--disable-setuid-sandbox',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                ],
                defaultViewport: {
                    width: 1280,
                    height: 720,
                },
                executablePath: await chromium.executablePath(),
                headless: chromium.headless,
            });
        }

        const page = await browser.newPage();

        // Set content and wait for it to load
        await page.setContent(html, {
            waitUntil: 'networkidle0',
        });

        // Generate PDF
        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '0.4in',
                right: '0.4in',
                bottom: '0.4in',
                left: '0.4in',
            },
        });

        return Buffer.from(pdf);
    } catch (error) {
        console.error('PDF generation error:', error);
        console.error('Error details:', {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            env: process.env.NODE_ENV,
        });
        // Throw error instead of silently falling back to HTML
        throw new Error(`Failed to generate PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}
