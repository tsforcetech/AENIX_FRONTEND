# AENIX Frontend — Continuity Log

Append-only. Each entry: date, work package, branch/PR/SHAs, what changed, tests actually run, open items, next gate. The project-wide ledger stays in AENIX (`docs/project/DEVELOPMENT-STAGES.md`, `docs/project/PROJECT-CONTINUITY.md`).

## Prior history (in AENIX)

- **FE-P0-001** foundation: AENIX PR [#3](https://github.com/tsforcetech/AENIX/pull/3), merged 2026-11-23 into AENIX `main` (`df295e0`).
- **FE-PROTO-001** clickable workflow prototype: AENIX PR [#4](https://github.com/tsforcetech/AENIX/pull/4), branch `feature/fe-proto-001-workflow-prototype` at `1177c1d`.

### 2026-11-23 — Repository move (FE-REPO-001)

- **Instruction:** the Project Owner asked to move all frontend work to `tsforcetech/AENIX_FRONTEND` because shared-repo work kept conflicting with backend changes. This repository is now used for frontend development.
- **What moved:** the full `frontend/` app at AENIX `1177c1d`, now at the repository root. This includes the FE-P0-001 foundation, the FE-PROTO-001 prototype, unit and e2e tests and the preview build. Also moved: the frontend docs (`docs/*.md`), `docs/adr/ADR-FE-001-frontend-framework.md`, and a reference copy of AENIX `contracts/openapi/openapi-v1.json`. It starts fresh with no history; history remains in AENIX.
- **Changes on move:** paths rewritten for the repository root; CI workflow moved to `.github/workflows/ci.yml`; `CLAUDE.md`/`AGENTS.md` added; API-DEP-03 marked partially confirmed by the P0-001 contract.
- **Open:** close or supersede AENIX PR #4 and remove `frontend/` from AENIX (owner decision; needs an AENIX PR); DOBIS acceptance of the prototype; ADR-FE-001 sign-off; danger/info colours and dark theme.
- **Next gate:** owner review of the prototype in this repository.

### 2026-11-23 — FLOW-001 service types, sales orders, PL→GRN and request→POD (in progress)

- **Instruction:** the Project Owner said work orders are not only transport (Warehouse and Direct service too; mode only for transport). The flow is Enquiry → Sales Order → Work Order → job completion drafts purchase invoices. Warehouse: PL → GRN, compared. Customer out-request → vendor POD, compared.
- **Branch:** `feature/fe-flow-001-service-types-so-grn-pod`. The domain foundation is `7e6e67b`/`43d3d58`; feature modules follow. See [`docs/BUSINESS-FLOW.md`](../BUSINESS-FLOW.md).
- **Governance:** the Sales Order entity and the GRN/POD controls extend the signed baseline and need a DOBIS change request before backend contracts (API-DEP-16…19).
- **Delivered (merged on the branch):**
  - Sales orders module.
  - Service type and optional mode in enquiries, quotations, contracts and work orders.
  - Work order documents: PL → GRN and request → POD, with line-by-line comparison, verify / raise variance, and an over-release guard.
  - Purchase invoices drafted per vendor on job completion.
  - Warehouse inbound/outbound tabs.
  - Purchase invoices show delivery evidence.
  - Home "Jobs by type", a Sales orders pipeline stage and new attention items.
  - Portals and reports handle the new types.
- **Tests (local):** format, lint, typecheck clean; unit 23/23; build ok; e2e 52 passed, 2 skipped (mobile-only skips), including a crawl of all screens incl. `/sales-orders/*`, `/work-orders/wo-2052…2054` with 0 WCAG 2.1 AA violations.
- **Next gate:** owner review of the PR and the refreshed preview; DOBIS change request for Sales Order + GRN/POD (API-DEP-16…19); answers to the open questions in `docs/BUSINESS-FLOW.md`.

### 2026-11-27 — FLOW-002 industry-standard order-to-cash

- **Instruction:** the Project Owner chose the **industry-standard flow** and added two requirements: **one customer invoice can bill several sales orders**, and **receipts can be taken against sales orders**, with the customer's **exact balance** always known.
- **Branch:** `feature/fe-flow-002-standard-order-to-cash`. Spec: [`docs/BUSINESS-FLOW.md`](../BUSINESS-FLOW.md). Backend copy: AENIX PR [#7](https://github.com/tsforcetech/AENIX/pull/7) (`docs/workflows/ORDER-TO-CASH-FLOW.md`).
- **Delivered:**
  - **Orders:** multi-service quotes, orders and jobs (transport + warehouse + other services); Quotation → "Convert to sales order" → confirmed SO → "Create job". Jobs are the work orders.
  - **Vendor side:** a vendor **PO is issued at assignment**; the Purchase orders module has a 3-way match; vendor invoices are recorded against the PO; job completion no longer drafts bills.
  - **Customer invoicing:** a **new customer invoice can combine several sales orders**.
  - **Receipts and payments:** **receipts** against invoices or as **SO advances** (apply advance later); **payment vouchers** to vendors.
  - **Ledgers and balances:** **chart of accounts** (create ledger accounts; automatic customer and vendor sub-ledgers); **exact customer balance** overall and per sales order; customers list and reports show balances.
  - **Portals:** customer portal PL upload; vendor portal PO acceptance and POD upload.
  - **Home:** new attention items.
- **Process note:** three of the four helpers hit a usage limit in their final checks. The orchestrating session reviewed their diffs (scope and safety scan), ran lint, Prettier and typecheck, committed them, and fixed the integration issues found by the e2e crawl: keyboard-focusable scroll regions, and a link-in-text contrast issue.
- **Tests (local):** format, lint, typecheck clean; unit 25/25; build ok; e2e **61 passed**, 2 skipped (desktop-only shortcuts on mobile), incl. a crawl of every screen with 0 WCAG 2.1 AA violations; production bundle has no sample data and denies by default.
- **Next gate:** owner review; DOBIS change request; accountant sign-off on the chart of accounts and postings; Antigravity contracts for API-DEP-16…26.

### 2026-11-27 — UX and document alignment (on PR #3)

- **Owner requests:**
  - an enquiry Kanban board;
  - easy, keyboard-friendly quotation and sales-order entry;
  - PL/GRN/POD arrive as Excel, so import them with column mapping;
  - in/out are repeated (many inbounds and outbounds per warehouse job);
  - align with the uploaded RHS GRN, Aenix customer GRN (AEN061) and tax invoice (AEN078) formats.
- **Delivered:**
  - **Enquiries:** Kanban (drag-and-drop plus keyboard, Won/Lost rules).
  - **Entry screens:**
    - a type-ahead customer/service combobox;
    - a keyboard-first price grid (Enter, arrows, Ctrl+Del, Alt+N) with rate-card suggestions;
    - Ctrl+S / Ctrl+Enter, a sticky totals bar, and `?` help.
  - **Excel/CSV import** with remembered per-party mapping (RHS and Aenix headers auto-map); `read-excel-file` pinned at 9.3.14 and lazy-loaded.
  - **Warehouse jobs:** many inbounds and outbounds per job, running stock per SKU, release guard, and the inbound shipment header (ASN/BOE/container/seal/BL).
  - **Documents:** customer GRN document (AEN061 layout); tax invoice in the AEN078 layout with AEN numbering.
  - **Storage billing** by sq.ft / pallet-day / CBM-day, with an hourly handling service.
  - **Settings → Company:** company profile incl. bank details. Bank values are placeholders in source.
- **Tests (local):** format/lint/typecheck clean; unit 33/33; build ok; e2e 61 passed, 2 skipped (crawl incl. Kanban, 0 WCAG 2.1 AA violations).
- **Open:**
  - owner to confirm bank details stay out of the public demo, and which address goes on invoices vs GRNs;
  - FEFO/batch stock tracking;
  - server-side PDF and stamp.

### 2026-11-28 — FLOW-003 industry-standard gap closure (branch `feature/fe-flow-003-industry-gaps`)

- **Asked:** close every partial/gap row of the gap analysis (67 scenarios: 26 match, 23 partial, 18 gap) in the frontend first; backend after owner confirmation.
- **Done:** foundation (types, controls, approval service, navigation) + five parallel work packages (sales, warehouse, transport/fleet, finance, cross-cutting), reviewed (scope + safety scan) and merged; demo data; document print layout. See `docs/BUSINESS-FLOW.md` §7.
- **Checks (local):** format, lint, typecheck clean; unit tests 131/131; build and build:prototype OK; e2e 82 passed, 2 skipped (desktop-only shortcuts on mobile) — crawl of every screen incl. 14 new routes and new tabs with 0 WCAG 2.1 AA violations; production build still has no sample data and denies by default.
- **Gates:** owner confirmation of the prototype; owner scope decisions (own fleet, own warehouse floor, multi-currency, payroll/fixed assets); accountant sign-off on all finance screens; SEC-001 for roles; DOBIS CR; then HO-FLOW-003 backend handoff and API-DEP-31…44 contracts.
- **AENIX ledger:** matching AENIX entry to be added with HO-FLOW-003.

### 2026-11-28 — FLOW-003 live; owner decisions; fixed assets (branch `feature/fe-flow-003b-fixed-assets`)

- PR #4 merged to `main` as `611d48b` with owner approval ("publish live"); GitHub Pages deployed and verified.
- Owner decisions: own fleet and own warehouse floor stay as optional modules; AED + foreign currency; payroll outside AENIX (monthly journal); fixed asset register in AENIX; default approval limits accepted.
- Added `/fixed-assets` (register, straight-line depreciation run, disposal) with unit tests; API-DEP-45.
- Checks: format, lint, typecheck clean; unit tests 135/135; build OK; e2e 83 passed, 2 skipped (0 WCAG 2.1 AA violations).
- Next gate: owner confirmation, then HO-FLOW-003 backend handoff to Antigravity; accountant sign-off on finance screens.

- 2026-11-28 (same branch, after owner feedback on the warehouse screen): warehouse switcher + add warehouse; **Upload Excel** for PL / GRN / release request / POD from the warehouse screen. Checks: unit 138/138; e2e 85 passed, 2 skipped (new test uploads a CSV product list on desktop and mobile with 0 axe violations).

### 2026-11-28 — Masters area (branch `feature/fe-masters`)

- Owner asked for every master; audit sheet lists 51 masters (33 missing, 11 partial, 7 exist).
- Built: Masters hub (`/masters`), 12 generic master lists + warehouses master, services (add / edit / deactivate), buying and selling rates (add / edit / expire / Excel import), pricing order customer rate → price list → cost + 20%, customer and vendor edit, masters used in forms (currencies, places, reasons, categories, payment terms, asset categories).
- Checks: format, lint, typecheck clean; unit 170/170; build OK; e2e 99 passed, 2 skipped (0 WCAG 2.1 AA violations).
- Next: 12 must-have masters still to add (contacts and addresses, prospects, pipeline stages, lead sources, sales team, quotation terms, Incoterms, vendor contacts, equipment types, cargo types, item / SKU, branches / cost centres); API-DEP-47.
