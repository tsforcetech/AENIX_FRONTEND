# AENIX_FRONTEND — agent instructions

This repository is the **frontend of AENIX ERP (DOBIS-PRJ-001)**. It is owned by Claude. The backend, SQL, migrations and API contracts live in [tsforcetech/AENIX](https://github.com/tsforcetech/AENIX) and are owned by Antigravity. DOBIS governs stage gates.

## Start of every task

1. Inspect `git status` and the latest commits on `main`. Re-read `README.md`, `docs/project/FRONTEND-CONTINUITY.md`, `docs/PROTOTYPE.md` and `docs/API-DEPENDENCIES.md`.
2. Check the governing AENIX documents on AENIX `main` (`README.md`, `AGENTS.md`, `docs/project/DEVELOPMENT-STAGES.md`, `docs/project/PROJECT-CONTINUITY.md`, `docs/ai/PROMPT-GENERATION-GUIDELINES.md`, `docs/standards/*`, `docs/adr/*`) and the current `contracts/openapi/` there.
3. Confirm the work package is authorized. ADRs marked PROPOSED are not approved; do not self-approve.

## Non-negotiable rules

- Invariants: **Work Order = Job**; Enquiry/Quotation/Contract are optional; warehouse stock is never negative; finance rules need accountant sign-off.
- The frontend binds only to contracts published in AENIX `contracts/openapi/`. Never invent endpoints, DTOs, permission codes or finance rules. Prototype view-models in `src/domain/types.ts` are provisional.
- The backend is the only authorization authority. There is no session scheme until ADR-004/SEC-001 are approved. Never put tokens in web storage.
- Sample data exists only in prototype modes (`pnpm dev`, `build:prototype`, `build:artifact`). Production builds must stay deny-by-default with no sample data (e2e-enforced).
- Do not modify AENIX backend code from here.

## End of every task

1. Run `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e` and report real output only.
2. Update `docs/project/FRONTEND-CONTINUITY.md` with SHAs, test results and the next gate. Ask for the matching AENIX ledger/continuity entry.
3. Stop at the end of the bounded work package. Open PRs; never merge without approval.
