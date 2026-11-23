# AENIX ERP — Frontend

Frontend of AENIX ERP (DOBIS-PRJ-001), a UAE transport, 3PL warehouse and finance platform. Owner: **Claude**. The backend, database and API contracts live in [tsforcetech/AENIX](https://github.com/tsforcetech/AENIX) (owner: Antigravity). DOBIS governs stage gates. Moved here from AENIX `frontend/` on 2026-11-23 (see [`docs/project/FRONTEND-CONTINUITY.md`](docs/project/FRONTEND-CONTINUITY.md)).
Framework decision: [`docs/adr/ADR-FE-001-frontend-framework.md`](docs/adr/ADR-FE-001-frontend-framework.md) (Project Owner approved 2026-11-23; DOBIS sign-off pending).

> **Status: FE-PROTO-001 clickable workflow prototype** on sample data, built on the FE-P0-001 foundation. See [`docs/PROTOTYPE.md`](docs/PROTOTYPE.md). The production build has **no** data source and no sample data, and stays deny-by-default until the identity contract and module APIs exist.

## Stack (pinned in `package.json` / `pnpm-lock.yaml`)

React 19 + TypeScript (strict) + Vite (static SPA) · TanStack Router · TanStack Query · openapi-fetch (typed client for the future OpenAPI contract) · Tailwind CSS v4 over semantic CSS tokens · self-hosted DM Sans / IBM Plex Mono · Vitest + Testing Library · Playwright + axe-core · ESLint (typescript-eslint, jsx-a11y, react-hooks) + Prettier.

## Commands

Use Node 22+ (`.nvmrc`) and pnpm (`packageManager` field; `corepack enable`).

```bash
pnpm install
```

```bash
pnpm dev            # PROTOTYPE on http://localhost:5173 (sample data); /api proxied to $AENIX_API_URL
```

```bash
pnpm build:prototype && pnpm preview:prototype   # static prototype build (dist-prototype/)
```

```bash
pnpm build:artifact   # single self-contained preview: dist-artifact/site/index.html (+ claude.ai copy)
```

The `prototype-preview` GitHub Actions workflow builds the same page on every push and PR. Download it as the `aenix-prototype` artifact from the run, or open the GitHub Pages site deployed from `main` (Pages source must be set to GitHub Actions once in repository settings).

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

```bash
pnpm test:e2e       # builds production (:4173) + prototype (:4174); Playwright + axe WCAG 2.1 AA
```

In sandboxes that already have a Chromium build, set `PW_CHROMIUM_PATH=/path/to/chrome`. CI runs `.github/workflows/frontend.yml`.

## Layout

```text
src/
  app/            root providers, router, root layout, dev harness (not production UI)
  shared/
    api/          openapi-fetch client factory, correlation id, ProblemDetails errors — NO endpoints
    auth/         session interface + deny-by-default RequireSession — NO session scheme yet
    permissions/  UX-only permission helpers (<Can>) — NOT a security control
    ui/           tokens.css (single theme source), styles.css, accessible primitives
    forms/        reserved until the first approved form
    utils/        AED / Asia/Dubai formatting, redacting logger
  features/       added per authorized phase once its contract is versioned
  assets/         authentic owner-supplied logo/assets only
tests/e2e/        Playwright + axe
```

Rules: a feature may import from `shared/` but never from another feature's internals. Do not scatter `fetch` calls across screens; use the shared client.

## Theming: applying the AENIX palette and UI reference

`src/shared/ui/tokens.css` is the **only** place colours, fonts, radii and spacing are defined. Its values come from the owner's Figma UI reference (see [`docs/UI-REFERENCE.md`](docs/UI-REFERENCE.md)). Components use semantic tokens (`bg-surface`, `text-fg`, `bg-primary`, `text-brand`, `rounded-md`, `text-body-s`, ...) and never raw hex values. The authentic logo is `src/assets/aenix-logo.png`, rendered via `shared/ui/Logo`. Fonts (DM Sans, IBM Plex Mono) are self-hosted; there is no runtime CDN.

## Contract consumption

- The source of truth for API contracts is [AENIX `contracts/openapi/`](https://github.com/tsforcetech/AENIX/tree/main/contracts/openapi). Today it has **technical endpoints only** (P0-001). This repository keeps a reference copy in `contracts/openapi/`; refresh it from AENIX whenever a contract changes.
- **Do not hand-write business endpoint paths or DTOs.** When a module contract is published, an authorized task generates types with `openapi-typescript` into `src/api/generated/` (never hand-edited) and swaps that module's prototype adapter (`src/features/<module>/api.ts`). The procedure is in [`docs/PROTOTYPE.md`](docs/PROTOTYPE.md).
- Requested contract items are tracked in [`docs/API-DEPENDENCIES.md`](docs/API-DEPENDENCIES.md).

## Security rules

- The backend is the only authorization authority. `<Can>` and hidden buttons exist for usability only.
- Do not store tokens in `localStorage`/`sessionStorage` (enforced by ESLint). Do not hard-code sessions or build an auth bypass. Use no session scheme until ADR-004/SEC-001 are approved.
- Portal screens never send or derive party IDs from URL, query or body values.
- `VITE_*` variables end up in the public bundle, so never put secrets there. `.env*` files are git-ignored except `.env.example`.
- No `dangerouslySetInnerHTML` without an approved sanitizer. External links use `rel="noopener noreferrer"`.
- Browser logs go through `shared/utils/logger.ts`, which redacts. Audit records are written by the backend, not the browser.
- Show users safe error messages (`userMessageFor`). Never render server stack traces.

## Performance and accessibility

Code splitting at route level as features arrive. Lists are server-paged, filtered and sorted, with no full-table downloads. Bundle and Web Vitals budgets will be set after a measured baseline. Target WCAG 2.1 AA: semantic HTML, a skip link, visible focus, live-region status messages and reduced motion. axe runs in e2e.

## Continuity

Every task re-reads the current Git state, [`CLAUDE.md`](CLAUDE.md), [`docs/project/FRONTEND-CONTINUITY.md`](docs/project/FRONTEND-CONTINUITY.md) and the governing AENIX documents (stage ledger, continuity record, prompt guidelines, standards, ADRs). Each task appends a continuity entry with evidence when it finishes.
