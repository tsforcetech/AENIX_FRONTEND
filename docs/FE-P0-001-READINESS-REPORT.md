# FE-P0-001 — Frontend Readiness Report

> **Moved from AENIX (2026-11-23).** This report is historical. Repository paths in it (`docs/project/…`, `docs/adr/ADR-00x…`, `frontend/…`) refer to the [AENIX](https://github.com/tsforcetech/AENIX) repository as it was at `ee08183`.

Date: 2026-11-23 | Owner: Claude (frontend) | Prompt: FE-P0-001 v1.0

## 1. Git evidence

- Remote: `https://github.com/tsforcetech/AENIX`
- `main` HEAD: `ee081830a653b39339291f35e55a6f2f44d38279`, which matches the prompt baseline.
- Remote branches at start: `main`, `docs/phase0-governance-architecture`, `docs/phase0-adr-refinements`, `claude/serene-galileo-vkv82k`.
- PRs: #1 `docs/phase0-governance-architecture` → **merged** 2026-11-23T07:44:27Z. #2 `docs/phase0-adr-refinements` → **merged** 2026-11-23T07:44:25Z. No open PRs before this package.
- Work branch: `feature/fe-p0-001-frontend-foundation`, created from `origin/main` `ee08183`.
- Absent at `main`: `frontend/`, `backend/`, `contracts/`, `AGENTS.md`, `CLAUDE.md`, `.github/`.
- Superseded work: an earlier session commit on `claude/serene-galileo-vkv82k` (`ADR-007` + `FRONTEND-ARCHITECTURE.md`) was **not** carried over. ADR-FE-001 and the `docs/*` documents replace it, and that branch should not be merged.

### Sources read at `ee08183` (sha256)

| File                                     | sha256 (first 16)                                                     |
| ---------------------------------------- | --------------------------------------------------------------------- |
| README.md                                | 29951449fc729451                                                      |
| docs/ai/PROMPT-GENERATION-GUIDELINES.md  | e5886166885e8d27                                                      |
| docs/project/PROJECT-CONTINUITY.md       | 7a648e550f10d8f9                                                      |
| docs/project/DEVELOPMENT-STAGES.md       | c8c798258985d9cf                                                      |
| docs/architecture/PROJECT-STRUCTURE.md   | b8b9a23fc4725020                                                      |
| docs/architecture/DATABASE-MIGRATIONS.md | 276ba2b83c813004                                                      |
| docs/standards/SECURITY-AND-AUDIT.md     | 93571ecd4fe89b58                                                      |
| docs/standards/ENGINEERING-STANDARDS.md  | 45f34d8ff95ba54c                                                      |
| docs/adr/ADR-001 … ADR-006               | 1d6301ac… / bc6f6225… / f3482091… / d99e4ca8… / cdbdde19… / f6e23b36… |

### Mismatches found

1. PROJECT-CONTINUITY and DEVELOPMENT-STAGES describe PR #1 as open, but it has been merged. Corrected with an append-only note in DEVELOPMENT-STAGES and a new continuity entry.
2. PROJECT-CONTINUITY says the governance docs are "drafted for review on `docs/phase0-governance-architecture`". They are now on `main`. Recorded; the history was not rewritten.

## 2. Approval matrix

| Item                                   | Status                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Frontend framework (React + TS + Vite) | **Approved by Project Owner** 2026-11-23 (chat instruction). ADR-FE-001 stays PROPOSED until DOBIS signs off |
| Bootstrap of `frontend/`               | **Authorized by Project Owner** ("please setup project in git"). Neutral harness only                        |
| UI reference                           | **Supplied**: Figma `N8vJQJUHGkxDhQqhiHBJ4M` + logo. Tokens applied; screens not built                       |
| Session/auth model (ADR-004, SEC-001)  | PROPOSED, so **BLOCKED** for live auth. Not implemented                                                      |
| OpenAPI contracts                      | **ABSENT**, so integration is BLOCKED. Requests in API-DEPENDENCIES.md                                       |
| Permission matrix (SEC-001)            | PROPOSED, so restricted workflows are BLOCKED                                                                |
| Hosting topology (INF-001)             | PENDING                                                                                                      |
| Deployment environment                 | Not authorized                                                                                               |

## 3. Session/auth decision

Not decided by the frontend. The scaffold uses `credentials: 'same-origin'`, has no token storage (enforced by an ESLint rule), and wraps protected routes in a deny-by-default boundary. The questions are listed in API-DEP-01 and API-DEP-13.

## 4. Test evidence (commands run in `frontend/`, 2026-11-23, Node 22.23.5, pnpm 10.28.0)

| Command                                   | Result                                                                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`                            | OK, no peer-dependency warnings after pinning TypeScript ~6.0.3                                                                                |
| `pnpm format:check`                       | All files pass                                                                                                                                 |
| `pnpm lint`                               | 0 errors, 0 warnings                                                                                                                           |
| `pnpm typecheck`                          | Pass                                                                                                                                           |
| `pnpm test`                               | 6 files, 15 tests passed                                                                                                                       |
| `pnpm build`                              | Built; JS ≈104 kB gzip (unoptimised baseline, no budget yet)                                                                                   |
| `pnpm test:e2e` (with `PW_CHROMIUM_PATH`) | 8/8 passed (desktop + mobile): harness renders, **axe WCAG 2.1 AA: 0 violations**, deny-by-default protected route, skip-link focus, 404 state |
| `pnpm audit --prod`                       | No known vulnerabilities                                                                                                                       |
| GitHub Actions `frontend.yml`             | **NOT RUN yet**: the workflow is added in this PR and has not been seen running                                                                |

Not run: Lighthouse/Web Vitals (no budget approved), contract tests (no contract), backend integration (no backend).

## 5. Safe next steps

1. DOBIS reviews the draft PR and signs off ADR-FE-001.
2. Owner confirms the open token questions (danger and info colours, dark theme) and provides a vector logo if available.
3. Antigravity answers API-DEP-01..14 and publishes the Phase 1 OpenAPI contract.
4. Next frontend package (proposed **FE-P0-002**): an app shell (header and side rail per the Figma reference) using only static navigation, behind the deny-by-default boundary, with no business data. It needs separate authorization.
