# 🎬 HIMS Demo — Short Walkthrough (5–7 min)

> **For:** Showing the HIMS to stakeholders / customers / new users.
> **Goal:** ~5–7 minute single recording covering the 4 main modules at a glance — not a deep tutorial. Just the "wow" moments.

---

## 🎙️ One-Time Setup (5 min before recording)

```bash
cd f:\HMS\hospital-managment-system
npm run dev                                          # leave running
npx tsx scripts/create-chinmay.ts                    # makes a test patient with package
```

Then in your browser:
- **Login as Admin** (or IPD Manager — needs `/ipd` access)
- Use **incognito**, hide bookmarks, zoom 100%, 1080p

---

## 🎬 The Recording — 4 Modules in ~5 minutes

### 🩺 Part 1 — OPD (1 minute)

**Show:**
1. Open `/reception/register` → quickly fill name + phone + age → **Save**.
2. Highlight the auto-generated UHID.
3. Open `/opd` → show appointment booking with token number.

**Say:**
> *"Patient registration to OPD appointment in under 60 seconds. Single UHID flows through every department — no duplicate entry."*

---

### 🛏️ Part 2 — IPD with Package (2 minutes) ⭐ HERO SCENE

**Show:**
1. `/ipd` → click **+ Admit Patient**.
2. Search "Chinmay" → fill Ward + Bed + Diagnosis + Doctor.
3. **Scroll to the green box** — IPD Package (Optional).
4. Open dropdown — **show category grouping** (ENT, OBG, ORTHO, etc.).
5. Select **ORTHO-016 — Total Knee Replacement (₹2,00,000)**.
6. Click **"▶ View inclusions / exclusions"** — show what's covered, what's not.
7. Click **Admit Patient** — done.
8. Navigate `/ipd/discharge-settlement/<admission-id>` → click **Print Summary Bill**.
9. Show the printed bill — clean one-pager with category totals and **Type: IPD**.

**Say:**
> *"Package billing in one click. The patient knows exactly what's included — Room, Nursing, Surgeon Fees — and what's extra. Bill auto-builds itself, ready to print at discharge."*

---

### 🔪 Part 3 — OT (1 minute)

**Show:**
1. Open `/ot/dashboard` → show today's surgery board + OT room status.
2. Click into a scheduled surgery → show WHO Safe Surgery Checklist (Sign In / Time Out / Sign Out).
3. Quickly show the surgery notes screen with consumables auto-billing back to IPD.

**Say:**
> *"WHO-compliant surgical safety checklist built in. OT consumables auto-post to the patient's IPD bill — no double entry."*

---

### 🚨 Part 4 — Emergency (1 minute)

**Show:**
1. `/er/dashboard` → point out **triage color codes** (Red / Orange / Yellow / Green / Blue).
2. Click **+ New ER Case** → toggle **"Unknown Patient"** → show temp UHID auto-generated.
3. Pick **Triage: Red** + fill vitals + click **Register & Triage**.
4. Show **MLC tab** for medico-legal cases (FIR number, police status).
5. Show **Disposition** dropdown — Discharge / Admit to IPD / Death.

**Say:**
> *"Unknown patients get a temp UHID instantly. Triage drives priority. MLC is built in. From ER to IPD is one click."*

---

### 🎯 Closing (30 sec)

**Show:** Navigate `/finance/reports` → click **Profit & Loss** tab → click any row to expand and show the drill-down.

**Say:**
> *"Every transaction across OPD, IPD, OT, and ER flows into one finance system. Click any number on the P&L to see the line items behind it. Full transparency from front desk to balance sheet."*

---

## 🎞️ Export Settings

- **1080p MP4, H.264, ~5 Mbps**
- Filename: `axten-hims-demo.mp4`
- Total runtime target: **5–7 minutes**

---

## 🛟 If Something Goes Wrong During Recording

| Issue | Fix |
|---|---|
| Package selector empty | Run `npx tsx scripts/seed-ipd-pricelist.ts` |
| Test patient missing | Run `npx tsx scripts/create-chinmay.ts` |
| Page loads slowly | Pause recording, wait, resume — trim in post |
| Wrong role / no access | Switch incognito → login as Admin |

---

*Short demo — Axten HIMS · v2.0 · 2026-05-26*
*For the full step-by-step manual, see `HIMS_USER_GUIDE.md`*
