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
