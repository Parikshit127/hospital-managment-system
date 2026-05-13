# HospitalOS Enterprise Master Billing & Revenue Cycle Management (RCM) Blueprint

Version: 3.0 Enterprise Production Architecture
Target: Real Multi-Specialty Hospital Deployment
Purpose: Enterprise-Grade Master Billing System Implementation

---

# 1. ENTERPRISE IMPLEMENTATION DIRECTIVE (CRITICAL)

This implementation is NOT a standalone billing page.

This is an extension and enhancement of an already existing Hospital Management System (HMS).

The implementation MUST:
- integrate with the current HMS architecture
- preserve all existing workflows
- reuse existing modules/services/components
- avoid breaking any current functionality
- maintain backward compatibility
- maintain accounting integrity
- preserve UI/UX consistency
- preserve RBAC and authentication
- preserve existing APIs and database structure

The implementation MUST NOT:
- rewrite stable existing systems unnecessarily
- create duplicate billing logic
- break current OPD/IPD workflows
- break current reports
- break existing accounting
- create disconnected UI patterns
- change the design language
- introduce schema conflicts
- remove existing financial records
- hard delete any finance data

This implementation should feel like a natural enterprise evolution of the current HMS.

---

# 2. CORE ENTERPRISE OBJECTIVE

The Master Billing System should become:

- Central Financial Command Center
- Revenue Cycle Management Platform
- Unified Patient Financial Ledger
- Insurance & TPA Settlement Engine
- Enterprise Cashier Management System
- Financial Audit Platform
- Accounting Integrity Layer
- Financial Analytics & Leakage Detection System
- Multi-Department Financial Orchestrator

This is NOT just a billing page.

It is the financial operating system of the hospital.

---

# 3. SYSTEM PHILOSOPHY

The system must be:

- Enterprise-grade
- Financially safe
- Audit-compliant
- GST compliant
- Insurance-aware
- Multi-payer capable
- Reversible
- Transaction-safe
- Event-driven
- Scalable
- Operationally efficient
- Impossible to misuse
- Easy for staff to operate
- Stable under production load

---

# 4. NON-DESTRUCTIVE IMPLEMENTATION POLICY

The implementation MUST follow additive architecture.

DO NOT:
- remove existing functionality
- replace stable systems unnecessarily
- rename critical tables
- modify production logic aggressively
- rewrite RBAC
- rewrite authentication
- rewrite invoice generation completely

Instead:
- extend existing services
- create orchestration layers
- create modular extensions
- reuse existing APIs/components
- add compatibility layers where needed
- preserve historical integrity

All implementation must be rollback-safe.

---

# 5. MASTER BILLING CORE RESPONSIBILITIES

The Master Billing module must:

- unify all hospital financial activity
- centralize patient financial visibility
- provide enterprise financial workflows
- orchestrate finance operations across departments
- track all receivables and liabilities
- support complete discharge settlement
- support insurance lifecycle management
- maintain financial auditability
- maintain accounting correctness
- provide real-time operational visibility
- reduce revenue leakage
- support enterprise reporting

---

# 6. MASTER BILLING PAGE STRUCTURE

---

# TOP HEADER SECTION

Contains:

## Global Search Engine

Search by:
- Patient Name
- UHID
- Mobile Number
- Invoice Number
- Receipt Number
- Claim ID
- Admission ID
- Doctor
- Department
- Corporate
- Insurance/TPA
- GST Invoice Number
- Payment Reference
- UPI Reference
- Transaction ID

Features:
- fuzzy search
- instant suggestions
- recent searches
- search history
- filter-aware searching
- keyboard-first interaction

---

## Quick Action Toolbar

Buttons:
- Generate New Bill
- Collect Payment
- Add Deposit
- Process Refund
- Create Credit Note
- Start Discharge Settlement
- Raise Insurance Claim
- Export Records
- Print Summary
- Reconcile Payments
- Open Approval Center

---

## Enterprise KPI Cards

Cards:
- Today's Revenue
- Outstanding Receivables
- Pending Claims
- Insurance Under Review
- Deposit Liability
- Refund Volume
- Revenue Leakage Alerts
- Pending Discharges
- Collection Efficiency
- Overdue Accounts
- Pending Approvals
- Department Revenue

Each KPI clickable and filter-aware.

---

# 7. MASTER BILLING MAIN GRID

Enterprise-grade financial grid.

Columns:
- Patient Name
- UHID
- Patient Type
- Admission Type
- Invoice Number
- Billing Category
- Corporate/TPA
- Invoice Status
- Payment Status
- Claim Status
- Total Amount
- Paid Amount
- Outstanding Amount
- Deposit Balance
- Aging Days
- Last Payment Date
- Financial Risk Flag
- Actions

---

# GRID FEATURES

Must support:
- sorting
- advanced filtering
- column resizing
- column visibility control
- saved views
- pagination
- infinite scroll
- export CSV/Excel/PDF
- bulk actions
- keyboard navigation
- row pinning
- multi-selection
- sticky headers
- server-side filtering

---

# STATUS SYSTEM

Invoice Status:
- Draft
- Finalized
- Partial
- Paid
- Overdue
- Cancelled
- Voided
- Refunded

Insurance Status:
- PreAuth Pending
- Submitted
- Under Review
- Approved
- Rejected
- Partially Approved
- Settled

Discharge Status:
- Pending
- Billing Pending
- Payment Pending
- Cleared
- Discharged

---

# 8. EXPANDABLE PATIENT FINANCIAL PROFILE

Clicking any billing row opens full enterprise financial profile.

---

# SECTION A - PATIENT SUMMARY

Display:
- patient photo
- name
- UHID
- age/gender
- contact information
- admission details
- doctor
- ward/room
- billing category
- insurance details
- corporate details
- financial flags
- outstanding balance
- credit limit

---

# SECTION B - FINANCIAL SUMMARY CARDS

Display:
- total billed
- total paid
- total outstanding
- deposits held
- insurance approved
- refunds issued
- credit notes
- write-offs
- package utilization
- GST totals

---

# SECTION C - INVOICE MANAGEMENT TAB

Displays:
- all invoices
- draft invoices
- finalized invoices
- cancelled invoices
- GST invoices
- package invoices

Actions:
- view
- edit
- finalize
- print
- whatsapp invoice
- download PDF
- clone invoice
- reopen invoice
- cancel invoice
- raise dispute
- add adjustment

---

# SECTION D - LINE ITEM MANAGEMENT

Each invoice must show:
- service name
- quantity
- rate
- discount
- tax
- net amount
- department source
- performed by
- timestamp
- package inclusion

Actions:
- add item
- edit item
- remove item
- apply package
- apply discount
- apply adjustment
- override pricing

All edits after finalization require approval and audit tracking.

---

# SECTION E - PAYMENT MANAGEMENT TAB

Displays:
- payment history
- receipt numbers
- payment methods
- transaction references
- split payments
- reversals
- reconciliation status

Supported Methods:
- cash
- card
- UPI
- online payment
- insurance settlement
- corporate settlement
- deposits

Actions:
- reverse payment
- resend receipt
- print receipt
- reconcile payment
- split payment
- apply balance

---

# SECTION F - DEPOSIT MANAGEMENT TAB

Displays:
- collected deposits
- applied deposits
- refundable balance
- refunded deposits
- deposit liability

Actions:
- collect deposit
- apply deposit
- transfer deposit
- refund deposit

All actions must auto-update accounting and patient balance.

---

# SECTION G - INSURANCE / TPA MANAGEMENT TAB

Displays:
- policy details
- coverage limit
- remaining balance
- preauthorization
- claim history
- settlement status
- rejection reasons
- approval history

Actions:
- create preauth
- raise claim
- upload documents
- resubmit claim
- settle claim
- dispute rejection
- split liability

---

# SECTION H - REFUND MANAGEMENT TAB

Workflow:
Request
→ Pending Approval
→ Approved/Rejected
→ Processed

Displays:
- refund amount
- refund method
- reason
- linked invoice/payment
- approval chain
- processing status

---

# SECTION I - CREDIT NOTE MANAGEMENT TAB

Displays:
- credit note number
- linked invoice
- amount
- reason
- GST impact
- approval status

Actions:
- create credit note
- approve credit note
- reverse credit note

---

# SECTION J - WRITE-OFF MANAGEMENT TAB

Purpose:
Manage unrecoverable dues.

Types:
- charity
- bad debt
- management waiver
- settlement adjustment
- employee waiver

Workflow:
Request
→ Approval
→ GL Posting
→ Audit Log

---

# SECTION K - PATIENT FINANCIAL LEDGER

MOST IMPORTANT SECTION.

Chronological patient financial statement.

Tracks:
- invoices
- payments
- deposits
- refunds
- insurance settlements
- credit notes
- write-offs
- reversals
- adjustments
- package utilization

Columns:
- date
- event
- debit
- credit
- running balance
- module source
- performed by
- reference number

Must behave like bank ledger.

---

# SECTION L - PAYMENT & BILLING TIMELINE

Chronological timeline:
- invoice created
- bill finalized
- payment collected
- insurance submitted
- insurance approved
- refund processed
- discharge settled
- adjustments applied

---

# SECTION M - AUDIT LOG TAB

Tracks EVERY action.

Track:
- user
- role
- action
- old value
- new value
- timestamp
- IP address
- device
- reason
- affected entity

Logs must be immutable.

---

# 9. BILLING ENGINE ARCHITECTURE

The system must use centralized billing orchestration.

DO NOT duplicate billing logic across modules.

Create:
# Central Billing Engine

Responsible for:
- pricing
- taxes
- discounts
- payer split
- package calculation
- insurance split
- corporate split
- deposits
- receivables
- GL posting
- GST posting
- settlement logic

---

# 10. PRICING ENGINE

Supports:
- tariff-based pricing
- room-category pricing
- doctor-specific pricing
- corporate negotiated pricing
- insurance negotiated pricing
- package pricing
- dynamic pricing
- emergency pricing

Must support future extensibility.

---

# 11. DISCOUNT ENGINE

Rules:
- max discount limit
- role-based approval
- department restrictions
- reason mandatory
- audit mandatory
- escalation rules

Approval Rules Example:
- 0-5% auto approval
- 5-15% manager approval
- 15%+ CFO approval

---

# 12. PACKAGE BILLING ENGINE

Supports:
- package inclusion
- exclusion rules
- package exhaustion tracking
- break package
- package upgrade
- package downgrade
- package alerts
- itemized fallback

Alerts:
- 80% consumed
- exceeded package
- excluded service billed separately

---

# 13. GST & TAX ENGINE

Supports:
- CGST
- SGST
- IGST
- cess
- reverse charge
- HSN/SAC codes
- GST invoice generation
- GST return preparation

Must preserve existing GST logic.

---

# 14. APPROVAL ENGINE

Centralized approval system.

Approval Types:
- refunds
- discounts
- write-offs
- credit notes
- claim overrides
- package overrides
- invoice reopen
- invoice cancellation

Workflow:
Request
→ Pending
→ Approved/Rejected
→ Executed

---

# 15. DISCHARGE BILLING WORKFLOW

Critical enterprise workflow.

---

# DISCHARGE CHECKLIST

Before discharge verify:
- lab charges completed
- pharmacy charges completed
- room charges updated
- nursing charges updated
- doctor rounds updated
- deposits adjusted
- insurance approval verified
- final bill generated
- payment collected

---

# DISCHARGE FLOW

Generate Final Bill
→ Apply Deposits
→ Apply Insurance
→ Collect Outstanding
→ Finalize Settlement
→ Generate Clearance
→ Mark Discharged

---

# 16. REVENUE LEAKAGE DETECTION ENGINE

Detect:
- performed service not billed
- medicine dispensed not charged
- admission without room charges
- claim eligible but not submitted
- duplicate payments
- orphan charges
- stale draft invoices
- package mismatch
- discharge without settlement

Provide:
- alerts
- reports
- risk scoring
- operational visibility

---

# 17. CASHIER EXPERIENCE REQUIREMENTS

Must support:
- extremely fast workflows
- keyboard-first interaction
- one-click payment collection
- split payments
- instant receipt printing
- instant WhatsApp receipts
- quick patient lookup
- quick discharge settlement

Cashier operations must require minimal clicks.

---

# 18. FINANCIAL SAFETY RULES

---

# NO HARD DELETE POLICY

Never hard delete:
- invoices
- payments
- refunds
- deposits
- claims
- credit notes

Use:
- soft delete
- reversal entries
- void state
- archive state

---

# VERSIONING SYSTEM

Every financial record must support versioning.

Example:
- Invoice V1
- Invoice V2
- Invoice V3

Track:
- who changed
- what changed
- why changed
- when changed

---

# PERIOD LOCKING

Locked periods:
- cannot be edited
- cannot receive new postings

Only:
- reversal entries
- adjustment journals

---

# DUPLICATE DETECTION

Prevent:
- duplicate invoices
- duplicate receipts
- duplicate claims
- duplicate payments
- duplicate refunds

---

# 19. DATABASE SAFETY REQUIREMENTS

DO NOT:
- drop production tables
- rename critical columns blindly
- break foreign key relationships
- overwrite historical financial data

Use:
- additive migrations
- extension tables
- transactional migrations
- rollback-safe deployment

Preserve:
- historical invoices
- payment history
- GST records
- Tally exports
- ledger history

---

# 20. RBAC & SECURITY REQUIREMENTS

Use EXISTING role system.

DO NOT rebuild RBAC.

Extend current permission architecture.

Suggested Permissions:
- billing.view
- billing.edit
- billing.cancel
- payment.collect
- refund.request
- refund.approve
- claim.manage
- writeoff.approve
- audit.view

---

# SECURITY REQUIREMENTS

Mandatory:
- RBAC
- MFA support
- audit logging
- secure API validation
- encrypted payment references
- session management
- device tracking
- permission middleware

---

# 21. API IMPLEMENTATION RULES

Existing APIs MUST NOT break.

Requirements:
- preserve response contracts
- maintain backward compatibility
- use API versioning if needed
- preserve existing integrations
- preserve frontend compatibility

Avoid:
- breaking schema changes
- removing fields abruptly
- changing response structures unnecessarily

---

# 22. EVENT-DRIVEN ARCHITECTURE

Every financial event must trigger:
- ledger updates
- audit logs
- GST updates
- accounting updates
- notifications
- analytics updates
- receivable recalculation

Example:
Invoice Finalized
→ GL Posted
→ GST Updated
→ AR Updated
→ Notification Sent
→ Audit Logged
→ Analytics Updated

---

# 23. NOTIFICATION SYSTEM

Notifications:
- overdue invoices
- package exhaustion
- pending approvals
- failed payments
- insurance rejection
- discharge pending
- GST filing due
- duplicate detection alerts

Channels:
- WhatsApp
- SMS
- Email
- Internal notifications

---

# 24. REPORTING SYSTEM

Reports:
- revenue by department
- AR aging
- insurance outstanding
- collection efficiency
- payment mode analysis
- GST reports
- write-off analysis
- refund analysis
- doctor revenue
- corporate outstanding
- package utilization
- daily settlement
- cash closure

All reports exportable.

---

# 25. BANK RECONCILIATION

Supports:
- bank statement import
- auto reconciliation
- manual reconciliation
- unmatched transaction detection
- duplicate transaction detection
- reconciliation reports

---

# 26. PERFORMANCE REQUIREMENTS

System must support:
- large hospitals
- concurrent cashiers
- 100K+ invoices
- real-time search
- fast loading

Use:
- indexing
- caching
- pagination
- lazy loading
- async jobs
- optimized queries

Avoid:
- N+1 queries
- heavy synchronous processing
- unnecessary rerenders

---

# 27. UI/UX REQUIREMENTS

The Master Billing UI MUST match the current HospitalOS design system.

Use:
- existing typography
- existing spacing
- existing tables
- existing cards
- existing modals
- existing button system
- existing sidebar/header structure
- existing interaction patterns

DO NOT:
- introduce disconnected UI
- use different design language
- create inconsistent layouts
- break existing navigation patterns

---

# UI PRINCIPLES

The interface must be:
- clean
- fast
- enterprise-grade
- operationally efficient
- minimal-click
- impossible to misuse

Features:
- sticky patient summary
- expandable sections
- contextual actions
- status colors
- keyboard shortcuts
- responsive layouts
- loading states
- optimistic updates

---

# 28. IMPLEMENTATION PHASE PLAN

DO NOT implement everything in one massive deployment.

Use phased architecture.

---

# PHASE 1

Core Master Billing:
- master grid
- global search
- patient financial profile
- invoice management
- payment management
- patient ledger

---

# PHASE 2

Financial workflows:
- deposits
- refunds
- credit notes
- write-offs
- approval center

---

# PHASE 3

Insurance & TPA:
- claims
- preauth
- settlement workflows
- dispute management

---

# PHASE 4

Enterprise safety:
- audit engine
- versioning
- period locking
- duplicate detection
- reconciliation

---

# PHASE 5

Advanced intelligence:
- leakage detection
- analytics
- forecasting
- financial insights
- operational dashboards

---

# 29. TESTING & VALIDATION REQUIREMENTS

Before deployment validate:

- existing invoices still work
- payment posting still works
- GST calculations remain correct
- discharge workflows still work
- claims still work
- reports still work
- RBAC still works
- APIs still work
- notifications still work
- exports still work
- accounting balances remain correct

---

# TEST EDGE CASES

Must validate:
- concurrent payments
- duplicate requests
- rollback handling
- partial payment failure
- insurance rejection
- stale sessions
- failed settlements
- package overflow
- invoice reopening

---

# 30. FINAL ENTERPRISE OBJECTIVE

The completed Master Billing System should:

- feel native to HospitalOS
- preserve all existing workflows
- unify all financial operations
- improve operational efficiency
- reduce revenue leakage
- provide enterprise-grade auditability
- support real hospital scale
- maintain accounting correctness
- maintain GST compliance
- support enterprise reporting
- remain production-safe
- remain highly maintainable

The final implementation should transform HospitalOS into a complete enterprise-grade hospital financial operating platform WITHOUT destabilizing the existing HMS ecosystem.

