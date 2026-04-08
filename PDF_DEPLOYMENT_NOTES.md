# Zealthix Document API - URL-Based Approach

## Overview

The Zealthix visit documents API now returns **URLs** to documents instead of base64-encoded content. This approach:
- ✅ Avoids memory issues on Vercel
- ✅ Reduces API response size and latency
- ✅ Allows on-demand PDF generation only when accessed
- ✅ Works on all Vercel plans (no Pro plan required)

## How It Works

1. **Documents API** returns URLs:
   ```json
   {
     "documents": [
       {
         "id": "INV-123",
         "title": "Invoice INV-2024-001",
         "contentType": "application/pdf",
         "attachmentType": "Bill",
         "url": "https://your-domain.com/api/invoice/123/pdf"
       }
     ]
   }
   ```

2. **Zealthix fetches the URL** with the API key:
   - The URL endpoints (`/api/invoice/[id]/pdf`, `/api/discharge/[admissionId]/pdf`) detect the API key
   - They return actual PDF files (generated on-demand using Puppeteer)
   - PDF generation happens only when the document is accessed, not upfront

3. **Browser users** get HTML:
   - Without API key → HTML view
   - With API key → PDF file

## Key Files

- **[app/lib/zealthix/document-fetcher.ts](app/lib/zealthix/document-fetcher.ts)** - Returns document URLs
- **[app/lib/pdf-generator.ts](app/lib/pdf-generator.ts)** - Generates PDFs on-demand
- **[app/api/invoice/[id]/pdf/route.ts](app/api/invoice/[id]/pdf/route.ts)** - Invoice PDF endpoint
- **[app/api/discharge/[admissionId]/pdf/route.ts](app/api/discharge/[admissionId]/pdf/route.ts)** - Discharge summary PDF endpoint

## Vercel Configuration

The `vercel.json` has function configuration for PDF endpoints:
```json
"functions": {
    "app/api/invoice/[id]/pdf/route.ts": {
        "maxDuration": 60,
        "memory": 3008
    },
    "app/api/discharge/[admissionId]/pdf/route.ts": {
        "maxDuration": 60,
        "memory": 3008
    }
}
```

**Note**: These settings require Vercel Pro plan. If you're on Hobby plan and encounter issues:
1. Reduce memory to 1024 (max for Hobby)
2. Reduce timeout to 10s
3. PDF generation may be slower but should still work for most documents

## Benefits of URL Approach

1. **Lower memory usage**: Documents fetched only when needed
2. **Faster API responses**: No upfront PDF generation
3. **Better scalability**: Each PDF generation is isolated
4. **Efficient caching**: URLs can be cached by Zealthix
5. **Plan flexibility**: Works on Hobby plan with reduced limits

## Testing

Test the documents API:
```bash
curl -X POST https://your-domain.com/api/zealthix/visit/documents \
  -H "X-Api-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"visitId": "VISIT_ID", "visitType": "INPATIENT"}'
```

Test a PDF URL:
```bash
curl -H "X-Api-Key: YOUR_API_KEY" \
  https://your-domain.com/api/invoice/123/pdf \
  | file -
# Should output: /dev/stdin: PDF document, version 1.4
```
