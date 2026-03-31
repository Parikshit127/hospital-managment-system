# WhatsApp API Setup Guide

## Overview
Your hospital management system is already configured to send WhatsApp notifications for:
- 📅 Appointment confirmations and reminders
- 💊 Prescription notifications
- 🏥 Admission confirmations
- ⏰ Medication reminders
- 🧪 Lab report ready alerts
- 📄 Discharge summaries
- 💰 Invoice notifications
- 🎫 Queue tokens and updates

## Step 1: Get Your Credentials

You mentioned you received a "pass" (access token) and "secret" from your WhatsApp API provider. You'll need:

1. **WHATSAPP_API_TOKEN** - The access token/pass you received
2. **WHATSAPP_PHONE_NUMBER_ID** - Your WhatsApp Business Phone Number ID
3. **WHATSAPP_APP_SECRET** - The secret you received
4. **WHATSAPP_WEBHOOK_VERIFY_TOKEN** - A custom token you create (any random string)

## Step 2: Configure Environment Variables

Open your `.env` file and fill in these values:

```env
# WhatsApp Business API Configuration
WHATSAPP_API_TOKEN="EAAxxxxxxxxxxxxxxxx"  # Replace with your actual token
WHATSAPP_PHONE_NUMBER_ID="1234567890"     # Replace with your Phone Number ID
WHATSAPP_WEBHOOK_VERIFY_TOKEN="myHospital2024SecureToken"  # Create a secure random string
WHATSAPP_APP_SECRET="abc123xyz456"        # Replace with your app secret
```

### How to find these values:

#### If using Meta/Facebook WhatsApp Business API:
1. **WHATSAPP_API_TOKEN**:
   - Go to Meta for Developers → Your App → WhatsApp → API Setup
   - Copy the "Temporary access token" or generate a permanent token

2. **WHATSAPP_PHONE_NUMBER_ID**:
   - Same page as above, under "Phone number ID"

3. **WHATSAPP_APP_SECRET**:
   - Go to App Dashboard → Settings → Basic
   - Copy the "App Secret"

4. **WHATSAPP_WEBHOOK_VERIFY_TOKEN**:
   - Create your own secure random string (e.g., "myHospitalSecure2024!")
   - You'll use this when configuring webhooks

#### If using a third-party provider (like Twilio, MessageBird, etc.):
- They should have provided you with API credentials
- Check their documentation for the equivalent fields

## Step 3: Configure Webhook URL

You mentioned you already sent them your API endpoints. Ensure they have:

**Webhook URL:**
```
https://your-domain.com/api/webhooks/whatsapp
```

**Webhook Events to Subscribe:**
- `messages` - For incoming messages and delivery status updates

**Verify Token:** Use the same value you set for `WHATSAPP_WEBHOOK_VERIFY_TOKEN`

## Step 4: Test the Integration

After configuration, restart your Next.js server:

```bash
npm run dev
```

### Test Webhook Verification:
The WhatsApp service will send a GET request to verify your webhook. Your endpoint will automatically respond if configured correctly.

### Test Sending Messages:
You can test by triggering any patient notification (like booking an appointment). The system will automatically send both email and WhatsApp messages.

## Step 5: Verify It's Working

1. **Check Logs:**
   - Look for `[WhatsApp]` prefixed logs in your console
   - If credentials are missing, you'll see: `[WhatsApp] API credentials not configured — skipping message`

2. **Database Tracking:**
   - All outgoing WhatsApp messages are tracked in the `MessageDeliveryLog` table
   - All incoming messages are stored in `WhatsAppIncomingMessage` table

3. **Test with a Real Appointment:**
   - Book an appointment for a test patient
   - Check if WhatsApp message is sent
   - Verify delivery status in the database

## API Flow

### Outgoing Messages:
```
Your App → sendWhatsAppMessage() → Meta Graph API → Patient's WhatsApp
```

### Incoming Messages & Status Updates:
```
WhatsApp → Meta Graph API → Webhook → Your App → Database
```

## Common Issues

### ❌ "API credentials not configured"
- Check if all environment variables are set correctly
- Restart your server after changing `.env`

### ❌ "Invalid signature"
- Verify `WHATSAPP_APP_SECRET` matches your Meta app's secret
- Check for extra spaces or quotes in the `.env` file

### ❌ Messages not sending
- Verify the phone number format (should be international format without +)
- Check if `WHATSAPP_API_TOKEN` is still valid (temporary tokens expire)
- Ensure phone number is registered with WhatsApp

### ❌ Webhook verification fails
- Ensure `WHATSAPP_WEBHOOK_VERIFY_TOKEN` matches what you configured in Meta
- Check if the webhook URL is publicly accessible (not localhost)

## Production Checklist

Before going live:

- [ ] Replace temporary access token with a permanent system user token
- [ ] Set up proper error monitoring for failed messages
- [ ] Test all notification types (appointment, prescription, etc.)
- [ ] Verify webhook signature validation is working
- [ ] Ensure phone numbers are in correct format
- [ ] Test with multiple patients
- [ ] Set up rate limiting if needed
- [ ] Configure message templates if required by your provider

## Additional Features

Your system already supports:
- ✅ Dual-channel notifications (Email + WhatsApp)
- ✅ Delivery tracking and status updates
- ✅ Incoming message handling
- ✅ Queue management notifications
- ✅ Medication reminders
- ✅ Signature verification for security

## Support

If you need help:
1. Check the console logs for `[WhatsApp]` or `[Notify]` prefixed messages
2. Verify your credentials in the Meta/provider dashboard
3. Test the webhook URL manually using tools like Postman
4. Check the database tables: `MessageDeliveryLog` and `WhatsAppIncomingMessage`

---

**Note:** WhatsApp Business API has strict policies. Ensure you:
- Have user consent to send messages
- Follow WhatsApp's messaging guidelines
- Don't spam users
- Provide opt-out options
