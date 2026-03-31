# WhatsApp Integration Troubleshooting & Testing Guide

## Issues Fixed

### 1. ✅ Added Comprehensive Error Logging
- The WhatsApp API now logs detailed error messages when sending fails
- You can see exactly what went wrong in your console/logs

### 2. ✅ Fixed Phone Number Format
- WhatsApp requires international format with country code
- The system now automatically adds '91' prefix for Indian numbers
- Example: '9876543210' → '919876543210'

### 3. ✅ Added Test Endpoint
- Created `/api/test-whatsapp` endpoint to test your configuration

## How to Test Your WhatsApp Integration

### Step 1: Check Configuration

**Option A - Using Browser/Postman:**
```
GET http://localhost:3000/api/test-whatsapp
```

**Option B - Using curl:**
```bash
curl http://localhost:3000/api/test-whatsapp
```

This will show you:
- Whether all credentials are configured
- First 10 characters of your API token
- Your Phone Number ID

### Step 2: Send a Test Message

**Using curl:**
```bash
curl -X POST http://localhost:3000/api/test-whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "9876543210",
    "message": "Test message from Hospital Management System"
  }'
```

**Using Postman:**
- Method: POST
- URL: `http://localhost:3000/api/test-whatsapp`
- Headers: `Content-Type: application/json`
- Body (raw JSON):
```json
{
  "phone": "9876543210",
  "message": "Test message from Hospital Management System"
}
```

Replace `9876543210` with your actual WhatsApp number.

### Step 3: Check Server Logs

After sending a test message, check your terminal/console for these logs:

✅ **Success logs:**
```
[WhatsApp] Attempting to send message to: 919876543210
[WhatsApp] Using Phone Number ID: 1009203208945184
[WhatsApp] Message sent successfully: { to: '919876543210', messageId: 'wamid.xxx...' }
```

❌ **Error logs will show:**
```
[WhatsApp] API Error Response: {
  status: 400,
  statusText: 'Bad Request',
  error: { ... detailed error message ... }
}
```

## Common Issues & Solutions

### ⚠️ Issue 1: Invalid Access Token

**Your current token:** `df8225b3e990567e1f97d`

**Problem:** This token appears too short. Meta WhatsApp API tokens usually look like:
```
EAAGm7kSL3Mxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
They're typically 200+ characters long.

**Solution:**
1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Select your app → WhatsApp → API Setup
3. Generate a **permanent access token** (not temporary)
4. Update your `.env` file with the full token

### ⚠️ Issue 2: Phone Number Not Registered

**Error:** `"Recipient phone number not in allowed list"`

**Solution:**
- In **test mode**, you can only send messages to phone numbers you've added to the "allowed list"
- Go to Meta for Developers → Your App → WhatsApp → API Setup
- Add recipient phone numbers under "To" field
- OR submit your app for Business Verification to send to any number

### ⚠️ Issue 3: Invalid Phone Number ID

**Current value:** `1009203208945184`

**How to verify:**
1. Go to Meta for Developers → Your App → WhatsApp → API Setup
2. Check the "Phone number ID" field
3. Make sure it matches exactly

### ⚠️ Issue 4: Authentication Failed

**Error:** `"Invalid OAuth access token"`

**Solutions:**
- Token might be expired (temporary tokens expire in 24 hours)
- Generate a permanent System User token
- Verify no extra spaces in your `.env` file

## Getting the Correct Credentials

### For Meta WhatsApp Business API:

1. **Access Token (WHATSAPP_API_TOKEN)**
   - Navigate to: [Facebook Developers](https://developers.facebook.com/)
   - Go to: Your App → WhatsApp → Getting Started
   - Look for "Temporary access token" or generate a permanent one
   - Should start with `EAAG...` and be 200+ characters

2. **Phone Number ID (WHATSAPP_PHONE_NUMBER_ID)**
   - Same page as above
   - Copy the "Phone number ID" (not the phone number itself)
   - Should be a 15-16 digit number

3. **App Secret (WHATSAPP_APP_SECRET)**
   - Go to: App Dashboard → Settings → Basic
   - Click "Show" next to "App Secret"
   - Copy the value

4. **Webhook Verify Token (WHATSAPP_WEBHOOK_VERIFY_TOKEN)**
   - This is YOUR custom token - create any secure random string
   - Example: `myHospital2024SecureToken!`

## Testing in Production

Once configured, test by:

1. **Register a new patient** with a valid phone number
2. **Book an appointment** for that patient
3. Check your server logs for WhatsApp activity
4. The patient should receive both email AND WhatsApp notification

## Server Logs to Monitor

Watch for these log prefixes:
- `[WhatsApp]` - WhatsApp API operations
- `[Notify]` - Notification dispatcher
- `[Notify] WhatsApp failed for appointment:` - Failed WhatsApp sends

## Need More Help?

If messages still aren't sending:

1. **Check the test endpoint response** - it will show the exact error from Meta
2. **Verify your Meta app status** - ensure it's not suspended
3. **Check rate limits** - Meta has messaging limits in test mode
4. **Verify phone number format** - must include country code
5. **Check Meta's error codes** - [WhatsApp Error Codes Documentation](https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes)

## Quick Checklist

- [ ] Access token is correct and not expired
- [ ] Phone Number ID matches Meta dashboard
- [ ] Recipient phone is in allowed list (for test mode)
- [ ] Phone number includes country code (e.g., 91 for India)
- [ ] Server is restarted after updating `.env`
- [ ] Test endpoint shows configuration is complete
- [ ] Server logs show WhatsApp attempts and any errors

---

**Remember:** In test mode, you can only send to registered test numbers. To send to any number, you need to complete Business Verification with Meta.
