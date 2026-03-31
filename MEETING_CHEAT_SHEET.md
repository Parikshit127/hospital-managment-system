# Zealthix Meeting - Quick Reference Cheat Sheet
## Print This & Take to Meeting! 📋

---

## 🎯 Meeting Objectives
1. ✅ Explain our API integration capability
2. ✅ Demo live API endpoints
3. ✅ Discuss security approach
4. ✅ Agree on integration timeline

---

## 🔑 Key Information

**Your Hospital OS Base URL:**
```
https://your-hospital.com
```

**API Documentation:**
```
https://your-hospital.com/admin/api-docs
```

**Support Contact:**
```
Email: tech@yourhospital.com
Phone: +91-XXXXXXXXXX
```

---

## 📡 Available Endpoints

### 1. Patient Search
```
POST /api/zealthix/patient/find
```
**Purpose:** Find patient by ID, mobile, or ABHA number
**Use case:** Zealthix searches for patient before pre-auth

### 2. Visit Details
```
POST /api/zealthix/patient/visit
```
**Purpose:** Get complete visit information & billing breakdown
**Use case:** Zealthix gets treatment details for claim

### 3. Documents
```
POST /api/zealthix/visit/documents
```
**Purpose:** Retrieve PDFs (invoices, discharge summary, reports)
**Use case:** Zealthix downloads documents for claim submission

### 4. Claim Status Update
```
POST /api/zealthix/claim/update
```
**Purpose:** Zealthix updates claim status in our system
**Use case:** Pre-auth approved, claim settled, amounts

---

## 🔐 Security Features

✅ **API Key Authentication** - X-Api-Key header
✅ **HTTPS Encryption** - All data encrypted in transit
✅ **Rate Limiting** - 100 requests/minute
✅ **Access Control** - Only authorized data
✅ **Audit Logging** - All API calls logged

---

## 🧪 Demo Checklist

Before demo:
- [ ] Open API documentation page
- [ ] Generate test API key
- [ ] Have test patient IDs ready
- [ ] Check internet connection
- [ ] Open Postman (optional)

During demo:
1. ✅ Show API docs interface
2. ✅ Generate API key live
3. ✅ Test patient search endpoint
4. ✅ Show response data
5. ✅ Explain security measures

---

## ❓ Expected Questions & Quick Answers

**Q: What's the response time?**
A: 200-500ms average, documents take 1-2 seconds

**Q: Can we test without affecting production?**
A: Yes, we'll provide staging API key

**Q: What about rate limits?**
A: 100 requests/minute, can increase if needed

**Q: How do we handle errors?**
A: Standard HTTP codes - 400/401/404/500

**Q: Is it secure?**
A: Yes - API keys, HTTPS, rate limiting, audit logs

**Q: Can we start today?**
A: Yes! I'll generate your test key right now

**Q: Integration timeline?**
A: 2-3 weeks (1 week testing, 1 week UAT, go-live)

---

## 📅 Proposed Timeline

| Week | Activity |
|------|----------|
| 1 | Testing with staging key |
| 2 | UAT with real data |
| 3 | Production go-live |
| 4 | Monitoring & stabilization |

---

## 🎤 Opening Statement (Read This!)

> "Hi team, I'm [Your Name] from [Hospital Name]. We're excited to integrate with Zealthix. Our Hospital OS has all the necessary APIs already built, tested, and documented. You can literally start testing today. Let me show you how it works."

---

## 🎬 Demo Script (Follow This!)

**Step 1:** Open `https://your-hospital.com/admin/api-docs`

**Step 2:** Click "External Integration" tab

**Step 3:** Click "Generate Key" button
- Label: "Zealthix - Demo"
- Click Generate
- **Copy key and show to them**

**Step 4:** Click on "Patient Find" endpoint
- Click "Test API" tab
- Enter test patient ID: `AVN-20250101-0001`
- Click "Send Request"
- **Show the JSON response**

**Step 5:** Explain the response:
- "This is real data from our database"
- "You'll use this to process claims"
- "All fields are documented"

---

## 📝 Post-Meeting Action Items

### Your Tasks:
- [ ] Send meeting summary email
- [ ] Generate staging API key
- [ ] Share documentation link
- [ ] Provide test patient IDs
- [ ] Schedule follow-up (1 week)

### Zealthix Tasks:
- [ ] Test all endpoints
- [ ] Provide webhook URL
- [ ] Share feedback
- [ ] Confirm go-live date

---

## 📧 Follow-up Email Template

**Subject:** Zealthix API Integration - Next Steps

**Body:**
```
Hi [Name],

Great meeting today! Here's what we covered:

✅ Showed 4 API endpoints
✅ Generated test API key
✅ Discussed security

🔑 Your Staging API Key: [KEY]
📚 Documentation: [URL]

Next Steps:
1. Test endpoints this week
2. Feedback call next [Day]
3. Go-live in 2-3 weeks

Questions? Email or call anytime.

Thanks,
[Your Name]
```

---

## 💡 Quick Tips

### Do's ✅
- Be confident - your system is ready!
- Show the live demo - it's impressive
- Take notes on their requirements
- Be honest if you don't know something

### Don'ts ❌
- Don't use too much technical jargon
- Don't promise unrealistic timelines
- Don't skip security discussion
- Don't forget to discuss support

---

## 🆘 Emergency Troubleshooting

**If API key doesn't work:**
→ Regenerate it, check for spaces

**If patient not found:**
→ Use different test patient ID

**If demo is slow:**
→ Explain documents take time

**If they ask something you don't know:**
→ "Great question! Let me confirm and email you today."

---

## 🎯 Success = Achieve These

By end of meeting:
✅ They understand the API
✅ They have a test API key
✅ They know next steps
✅ Timeline is agreed
✅ Support process is clear

---

**You're ready! Good luck! 🚀**

---

## 🔢 Test Patient IDs (Keep Handy)

Have 2-3 test patients ready:
- Patient 1: `AVN-20250101-0001`
- Patient 2: `[Your actual test ID]`
- Patient 3: `[Your actual test ID]`

---

## 📱 Important URLs (Quick Access)

**API Docs:**
https://your-hospital.com/admin/api-docs

**Admin Panel:**
https://your-hospital.com/admin

**Patient Portal:**
https://your-hospital.com/patient

---

*Print this page and keep it with you during the meeting!*
