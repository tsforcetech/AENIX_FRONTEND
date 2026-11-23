# AENIX ERP — Clickable Workflow Prototype (FE-PROTO-001)

Version 0.1 | 2026-11-23 | Owner: Claude (frontend) | Status: IN REVIEW | Repository: `tsforcetech/AENIX_FRONTEND`

## Why this exists

The Project Owner asked on 2026-11-23 for the **whole workflow first, built with dummy data**, so the team can review the end-to-end flow and then switch each module to the real API as Antigravity delivers it. The visual direction is the owner's: keep the AENIX logo and red/charcoal/white palette, but **do not copy the Figma header/tabs**; use a modern ("market trend") UI.

This deliberately goes further than FE-P0-001's foundation-only scope. It is a **prototype, not the application**. The guardrails below keep it from being mistaken for, or shipped as, the real system.

## Guardrails (non-negotiable)

| Risk                               | Control                                                                                                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sample data shipped to production  | Every mode except `development`/`prototype`/`test` aliases `@/prototype/seed` to `seed.empty.ts` (`vite.config.ts`). An e2e test fails if sample names appear in `dist/`                                            |
| Prototype mistaken for live system | A permanent "Prototype · sample data only" banner on every signed-in screen; the login page shows a "demo" persona switcher                                                                                         |
| Fake login treated as real         | `prototypeSignIn` throws unless `VITE_DATA_SOURCE=mock`. In a production build, sign-in shows "Sign-in isn't available yet" and every protected route denies by default (e2e tested)                                |
| Invented API contracts             | Screens never touch the store. Each module's `api.ts` exposes TanStack Query hooks backed by a **prototype adapter**. The view-models in `src/domain/types.ts` are marked PROVISIONAL and are **not** API contracts |
| Client-side "authorization"        | `<Can>`/persona menus are UX only. Portal screens read the party from the session, never from the URL                                                                                                               |
| Finance rules invented by UI       | Totals and journals in the prototype are illustrative. Chart of accounts and posting rules remain pending accountant sign-off (Phase 8)                                                                             |

## Run it

```bash
pnpm install
```

```bash
pnpm dev                      # prototype on http://localhost:5173 (uses .env.development → VITE_DATA_SOURCE=mock)
```

```bash
pnpm build:prototype && pnpm preview:prototype   # static prototype build in dist-prototype/
```

```bash
pnpm build                    # PRODUCTION build: no data source, no sample data, deny-by-default
```

Sign in with any credentials. Choose the **Staff**, **Customer** or **Vendor** persona. Data lives in the browser tab (sessionStorage) and resets when the tab closes.

## Workflow covered

See [`BUSINESS-FLOW.md`](BUSINESS-FLOW.md) (FLOW-001). In summary:

- **Masters:** customers, vendors, services and vendor rates.
- **Order to job:** **Enquiry** (type: Transport with mode / Warehouse / Direct service) → optional **Quotation** → **Sales order** (from quotation, contract or direct) → **Work order = Job**.
- **On the job:**
  - **PL → GRN** compared, for warehouse jobs;
  - **customer out-request → POD** compared;
  - vendor assignments and milestones by type.
- **Completion and billing:** job completion drafts **purchase invoices** to vendors; then customer **invoice** → **collection** → **accounting**.
- **Also:** **warehouse** (stock, movements, inbound and outbound reconciliation), **storage billing**, **reports**, the **customer and vendor portals**, and illustrative **settings**.

## Switching a module to the real API (repeat per module)

1. Antigravity publishes the module's versioned OpenAPI contract in `contracts/openapi/`.
2. In an authorized task, generate the types (`openapi-typescript`) into `src/api/generated/`.
3. In `src/features/<module>/api.ts`, replace the body of the `<module>Api` adapter object with calls through `createApiClient<paths>()`. Keep the hook names and signatures so the screens do not change. Map any differences between view-model and contract inside the adapter.
4. Replace the provisional types in `src/domain/types.ts` for that module with the generated types, or adapt them in the adapter.
5. Add contract tests and update e2e tests to run against an authorised test API.
6. Remove the module's reliance on `@/prototype/store`. When no module uses it, delete `src/prototype/`.
7. Update `docs/API-DEPENDENCIES.md`, `DEVELOPMENT-STAGES.md` and `PROJECT-CONTINUITY.md`.

| Module                               | Adapter file                                                             | Backend phase | Contract status               |
| ------------------------------------ | ------------------------------------------------------------------------ | ------------- | ----------------------------- |
| Home / dashboard                     | `features/home/api.ts`                                                   | Phase 10      | REQUESTED (API-DEP-15)        |
| Customers, Vendors, Services & rates | `features/{customers,vendors,services}/api.ts`, `shared/data/lookups.ts` | Phase 2       | PENDING                       |
| Enquiries, Quotations, Contracts     | `features/{enquiries,quotations,contracts}/api.ts`                       | Phase 3       | PENDING                       |
| Work orders                          | `features/work-orders/api.ts`                                            | Phase 4       | PENDING                       |
| Warehouse                            | `features/warehouse/api.ts`                                              | Phase 5       | PENDING                       |
| Storage billing                      | `features/storage-billing/api.ts`                                        | Phase 6       | PENDING                       |
| Invoices, Vendor bills, Collections  | `features/{invoices,vendor-bills,collections}/api.ts`                    | Phase 7       | PENDING + accountant sign-off |
| Accounting                           | `features/accounting/api.ts`                                             | Phase 8       | PENDING + accountant sign-off |
| Customer / vendor portals            | `features/portal/api.ts`                                                 | Phase 9       | PENDING + CR-001              |
| Reports                              | `features/reports/api.ts`                                                | Phase 10      | PENDING                       |
| Settings / identity                  | `features/settings/*`, `shared/auth/session.ts`                          | Phase 1       | PENDING ADR-004/SEC-001       |

## Design system notes

- Tokens: `src/shared/ui/tokens.css` (Figma variables plus derived `brand-hover`, `info-subtle` and card shadows).
- Text uses `fg`, `fg-secondary` or `fg-muted` only. `fg-disabled` (#8b8584) fails 4.5:1 contrast and is reserved for disabled icons.
- Charts follow the dataviz rules: one axis, single-series brand red, transport modes in validated categorical slots 1–3 (blue/orange/aqua) always with labels, a table view, and text in text tokens.
