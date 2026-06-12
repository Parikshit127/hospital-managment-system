# Pharmacy Inventory Maintain Karne Ki Guide (Hinglish)

Yeh guide aapke actual Pharmacy module ke hisaab se likhi gayi hai. Screen pe jo buttons/fields hain wahi yahan steps me hain.

---

## 1. Inventory Dekhna (Pharmacy → Inventory)

Page: **Pharmacy → Inventory**

- Har medicine ek **card** ke roop me dikhta hai: upar **Brand Name**, neeche **Generic Name**.
- Har card ke andar uske **batches** dikhte hain — har batch ka **BATCH No**, **Exp date (DD/MM/YYYY)**, aur **stock (Vol)**.
- Stock **10 se kam** ho to number **laal (red)** dikhega, warna **hara (green)**.
- Jis medicine ka koi batch nahi, uspe **"Out of Stock"** likha aayega.

### Search aur Low-Stock Filter
- **Search medicines...** box me brand ya generic naam type karke turant filter hota hai.
- **"Show All Stock" / "Showing Low Stock"** button toggle hai — low-stock pe click karne se sirf wahi medicines dikhengi jinka total stock `min_threshold` (default 10) se kam hai.

---

## 2. Naya Stock Add Karna (Add Bulk Stock)

Upar right me **"+ Add Bulk Stock"** button.

Click karne pe modal khulta hai — **"Add Generic Item & Batch"**. Fields bharo:

| Field | Zaroori? | Note |
|---|---|---|
| Brand Name | Haan | Medicine ka brand |
| Generic Name | Nahi | Salt / generic naam |
| Batch No | Haan | Supplier batch number |
| Qty | Haan | Kitni quantity aayi |
| Unit Price | Haan | Per unit price |
| Expiry | Haan | Batch ki expiry date |

Phir **"Save Item"** dabao.

> Logic: Agar brand pehle se hai to usi medicine me naya **batch** add ho jaata hai. Naya brand hai to nayi item ban jaati hai. (Action: `addInventoryBatch`)

> **Tip — FEFO:** Dispense ke time system **pehle expire hone wale batch** ka stock pehle use karta hai, isliye batch ki sahi expiry daalna zaroori hai.

---

## 3. Bulk Import (Excel/CSV se ek saath bahut saari dawai)

Agar shuruaat me poora stock ek saath chadhana hai to **bulk import** use karo (API: `/api/pharmacy/import-inventory`). Excel/CSV me columns: brand, generic, batch no, qty, price, expiry, rack. Isse manually ek-ek add karne ki zarurat nahi.

---

## 4. Restocking — Sahi Tarika (Suppliers → Purchase Order → Receive)

Roz-marra restock ke liye **purchase flow** use karna best hai (audit trail banta hai). Steps neeche detail me hain (Section 4A aur 4B).

> Difference: "Add Bulk Stock" = quick manual entry. "Purchase Order → Receive" = proper procurement with supplier + invoice tracking. Daily operations me PO flow recommended hai.

---

## 4A. Purchase Order (PO) Banana — Step by Step

Page: **Pharmacy → Purchase Orders**

Yahan ek **table** dikhta hai: PO Number, Supplier, Total Amount, Date, Status (Draft/Sent/Received), aur Action.

### Nayi PO banane ke steps:

1. Upar right me **"+ Create PO"** button dabao → **"Create Purchase Order"** modal khulta hai.
2. **Supplier \*** dropdown se vendor choose karo. (Agar list khaali hai to pehle **Pharmacy → Suppliers** me supplier add karo.)
3. **Add Medicine** search box me dawai ka naam type karo → dropdown me result aayega → us par click karke order me add karo.
   - Add hote hi uska **Unit Price** aur **GST %** auto bhar jaate hain (edit kar sakte ho).
4. Items table me har row me set karo:
   - **Qty** — kitni quantity order karni hai
   - **Unit Price (₹)** — per unit rate
   - **GST %** — tax rate
   - **Total** auto calculate hota hai; row hatane ke liye **✕** dabao.
5. Niche **Total** poore order ka amount dikhata hai.
6. **Notes (optional)** me koi instruction likh sakte ho.
7. **"Create PO"** dabao. PO ban jaati hai (status shuru me **Draft/Sent**).

> Zaroori: Supplier select hona aur kam se kam ek item hona must hai, warna button disabled rehta hai.

### Maal aane par Stock Receive karna (PO → Inventory):

1. PO list me us order ki row par **"Receive Stock"** (orange button) dabao.
2. **"Receive Stock: <PO Number>"** modal khulta hai — har item ke liye bharo:
   - **Qty Receiving** — kitna maal actually aaya (default: bacha hua quantity)
   - **Batch No** — supplier ka batch number *(must)*
   - **Expiry Date** — us batch ki expiry *(must)*
3. **"Save into Inventory"** dabao.
   - Stock **automatically Inventory me batch-wise add** ho jaata hai.
   - PO ka status **Received** (ya partial) ho jaata hai. Pura aane par **"Fully Received"** dikhta hai.

> Tip: Agar pura maal nahi aaya to sirf jitna aaya utna Qty daalo — baaki baad me dusre receive me le sakte ho.

---

## 4B. Purchase Invoice (Supplier Bill) — Step by Step

Page: **Pharmacy → Purchase Invoices**

Yeh supplier ke **bill / payable** track karne ke liye hai. Upar status filter chips hain: **All / Draft / Posted / PartiallyPaid / Paid**.

### Nayi Purchase Invoice banane ke steps:

1. Upar right me **"+ New Invoice"** dabao → **"Create Purchase Invoice"** modal khulta hai.
2. Header fields bharo:
   - **Vendor \*** — supplier choose karo
   - **Linked PO (optional)** — agar PO se aaya maal hai to wahi PO select karo (sirf *Received / Partially Received* POs dikhti hain). Isse aage **3-way match** ho paata hai.
   - **Invoice Number \*** — supplier ke bill ka number (e.g. SUPINV-001)
   - **Vendor GSTIN** — supplier ka GST number
   - **Invoice Date** aur **Due Date**
3. **Line Items** — har dawai ke liye:
   - **Medicine** search box me naam type karke select karo (Unit Price, GST %, HSN auto aate hain)
   - **Qty**, **Unit Price**, **GST %** set karo → **Line Total** auto banta hai
   - aur lines ke liye **"+ Add Line"**; line hatane ke liye **✕**
4. Niche **Grand Total** (GST sahit) dikhta hai.
5. **"Create Invoice"** dabao → invoice **Draft** status me ban jaata hai.

### Invoice ko aage badhana (Actions column ke icons):

Har invoice row me right side actions:

1. **👁 View (Eye)** — invoice detail: vendor, subtotal, CGST/SGST, total, paid, aur line items.
2. **🔍 3-Way Match (Search icon)** — *sirf Draft + jab PO linked ho*. PO vs GRN (received) vs Invoice ka qty/rate variance check karta hai. Result modal batata hai variance tolerance % ke andar hai ya review chahiye.
3. **✅ Post to GL (Check icon)** — *Draft/PendingApproval* par. Invoice ko **General Ledger + GST** me post karta hai. Status **Posted** ho jaata hai. (Iske baad payment ho sakta hai.)
4. **💳 Record Payment (Card icon)** — *Posted/PartiallyPaid* par. **"Record Payment"** modal:
   - **Amount** (default: bacha hua balance)
   - **Method** — Bank Transfer / Cash / Cheque / UPI
   - **Reference** — UTR / Cheque No.
   - **"Pay"** dabao. Pura pay hone par status **Paid**, warna **PartiallyPaid**.

> Recommended order: **Create → (PO linked ho to) Match → Post → Pay.**
> Note: PO **Receive** se stock badhta hai. Purchase Invoice mukhya roop se **accounting/GST/payment** ke liye hai — yeh dono alag-alag steps hain.

---

## 5. Stock Kam Kaise Hota Hai (Dispense)

- **Pharmacy → Orders / Queue** me doctor ke orders aate hain.
- **Dispense** karne pe stock **automatically kam** hota hai (FEFO — pehle expiry wala batch pehle), aur invoice ban jaata hai.
- Galat entry sudharni ho to **Stock Adjustment** (`adjustStock`) se manual correction kar sakte ho.

---

## 6. Returns

**Pharmacy → Returns**: patient ya supplier return process karo (`processReturn`) — stock wapas adjust ho jaata hai.

---

## 7. Roz / Hafte Me Monitor Karne Ki Cheezein

- **Low Stock Alerts**: Inventory page pe "Showing Low Stock" filter, ya dashboard alerts — kam stock waali dawai time pe order karo.
- **Expiring Batches**: 30 din me expire hone waale batches alag dikhte hain (`getExpiringBatches`) — inhe pehle dispense karo ya return karo.
- **Reports**: **Pharmacy → Reports** me revenue, inventory movement, analytics dekho.
- **Narcotics Register**: schedule drugs ke liye alag register maintain hota hai (**Pharmacy → Narcotics**).

---

## Quick Summary (Ek Line Me)

1. **Pehli baar** → Bulk Import se poora stock chadhao.
2. **Naya batch** → Add Bulk Stock.
3. **Restock** → Supplier → Purchase Order → Receive → Purchase Invoice.
4. **Bechna/Dispense** → Orders se dispense (stock auto-minus, FEFO).
5. **Monitor** → Low Stock + Expiring + Reports roz dekho.
6. **Correction** → Stock Adjustment / Returns.
