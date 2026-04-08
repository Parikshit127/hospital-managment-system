# PDF Generation on Vercel - Deployment Notes

## Changes Made

### 1. Updated `vercel.json`
Added function-specific configurations for PDF routes to handle Chromium's resource requirements:
- **Max Duration**: 60 seconds (up from default 10s)
- **Memory**: 3008 MB (up from default 1024MB)
- Routes configured: `/api/invoice/[id]/pdf` and `/api/discharge/[admissionId]/pdf`

### 2. Updated `app/lib/pdf-generator.ts`
- Added Chromium optimizations for Vercel serverless environment
- Set `chromium.setGraphicsMode = false` to reduce memory usage
- Added production-specific Chrome args: `--single-process`, `--disable-dev-shm-usage`, etc.
- Improved error handling to throw errors instead of silently returning HTML
- Added detailed error logging to help diagnose production issues

## Deployment Steps

1. **Push the changes** to your repository:
   ```bash
   git add .
   git commit -m "fix: Configure PDF generation for Vercel deployment"
   git push
   ```

2. **Verify Vercel build** completes successfully

3. **No environment variables needed** - the configuration is automatic

4. **Test the deployed API** after deployment completes

## Vercel Plan Requirements

⚠️ **Important**: The 3008MB memory configuration requires a **Vercel Pro plan** or higher.

- **Hobby plan**: Max 1024MB memory (will not work for PDF generation)
- **Pro plan**: Up to 3008MB memory ✅
- **Enterprise plan**: Custom limits ✅

If you're on the Hobby plan, PDF generation will likely timeout or fail. Consider upgrading to Pro.

## Testing

After deployment, test with:
```bash
curl -H "X-Api-Key: YOUR_API_KEY" https://your-domain.vercel.app/api/invoice/INVOICE_ID/pdf | head -20
```

Should return PDF binary data starting with `%PDF-1.4` instead of HTML.

## Troubleshooting

If PDFs still return as HTML:
1. Check Vercel deployment logs for errors
2. Verify you're on Pro plan (check Vercel dashboard)
3. Check function execution time (should be under 60s)
4. Look for memory exceeded errors in logs

## Why This Was Needed

- Chromium binary is ~150MB and requires significant resources
- Default Vercel limits (10s timeout, 1024MB) are insufficient
- Without proper config, PDF generation fails and falls back to HTML
- The fix ensures adequate time and memory for Puppeteer to launch Chromium and generate PDFs
