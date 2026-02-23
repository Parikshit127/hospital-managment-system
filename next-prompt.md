---
page: discharge_admin
---
Create the **Discharge & Admin Dashboard** for Avani Enterprise Hospital OS.

**DESIGN SYSTEM (REQUIRED):**
- Use **Tailwind CSS**.
- **Colors**: Slate-50 bg, White cards, Teal-600 primary, Red-500 alerts.
- **Typography**: Clean sans-serif (Inter).
- **Icons**: Use `lucide-react`.
- **Layout**: Dashboard layout with Stats and Actionable List.

**Page Structure:**
1.  **Header**: "Discharge & Administration" with a `FileCheck` or `Building` icon.
2.  **KPI Cards**: "Total Admissions", "Pending Discharges", "Revenue Today".
3.  **Admitted Patients List**:
    -   Table: Patient Name, Doctor, Diagnosis, DOS (Date of Surgery/Stay).
    -   Status: Admitted / Ready for Discharge.
    -   Action: "Process Discharge" button (Teal).
4.  **Discharge Modal** (Simulated):
    -   Summary text: "Final Bill Cleared?" (Checkbox)
    -   "Generate Summary" button.
5.  **Interaction**:
    -   Standard dashboard interactions.
