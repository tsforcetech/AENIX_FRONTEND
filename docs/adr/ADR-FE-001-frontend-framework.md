# ADR-FE-001: Frontend Framework and Client Foundation

- **Status:** PROPOSED — **Project Owner approved the framework on 2026-11-23** (owner instruction in the Claude session: "Approve the framework … please setup project in git"). Formal DOBIS sign-off is pending.
- **Date:** 2026-11-23
- **Author:** Claude (frontend owner)
- **Work package:** FE-P0-001
- **Scope:** Framework, build tooling, routing, server-state, API client approach, styling/token approach, test toolchain. **Excludes** the session/auth scheme (ADR-004), visual design (owner UI reference) and business screens.

## Context

- AENIX is an English, responsive, authenticated ERP for one company, with staff users plus narrow customer and vendor portals. It needs no SEO and no public content, so server-side rendering (SSR) is not required.
- The backend is ASP.NET Core and is proposed for IIS hosting (ADR-003; INF-001 pending). A static SPA can be served by IIS next to `Aenix.Api` without a Node runtime in production.
- The frontend must use the versioned OpenAPI contract (`PROJECT-STRUCTURE.md`), and the server is the only authorization authority (`SECURITY-AND-AUDIT.md`).
- Data-heavy screens need server-side paging and a typed client (ENGINEERING-STANDARDS performance rules).

## Options

| Option                            | Fit                                                                                                                      | Concerns                                                                                         | Verdict            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------ |
| **React + TypeScript + Vite SPA** | Static output for IIS; largest ecosystem for data grids, forms and headless accessible components; mature OpenAPI typing | Needs explicit library choices (pinned here)                                                     | **Recommended**    |
| Angular                           | All-in-one and opinionated; strong for form-heavy ERPs                                                                   | Heavier; slower iteration; RxJS learning curve                                                   | Viable alternative |
| Blazor WebAssembly                | One C# stack with the backend                                                                                            | Large initial download; thinner grid/accessibility ecosystem; blurs Claude/Antigravity ownership | Not recommended    |
| Next.js / other SSR               | SSR, server components                                                                                                   | Needs a Node server on IIS; SSR brings no benefit to an authenticated ERP                        | Rejected           |

## Decision (foundation)

Versions resolved from the npm registry on 2026-11-23 and locked in `pnpm-lock.yaml`:

| Concern         | Choice                                                                     | Version                 | Reason                                                                                                                                                                      |
| --------------- | -------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI runtime      | react / react-dom                                                          | 19.3.1                  | Current stable                                                                                                                                                              |
| Language        | typescript (strict, `noUncheckedIndexedAccess`)                            | 6.0.3                   | 7.0.x exists, but typescript-eslint 8.73 supports `<6.1`; revisit when lint support lands                                                                                   |
| Build           | vite + @vitejs/plugin-react                                                | 8.3.8 / 6.3.0           | Fast static SPA build                                                                                                                                                       |
| Routing         | @tanstack/react-router                                                     | 1.170.46                | Type-safe routes and search params (filters/paging in the URL)                                                                                                              |
| Server state    | @tanstack/react-query                                                      | 5.108.3                 | Caching and cancellation; retries for safe reads only; no global store for server data                                                                                      |
| API client      | openapi-fetch                                                              | 0.17.0                  | Thin typed client for the generated contract types. The generator (`openapi-typescript`) is deferred until a contract exists and its TypeScript 6 peer support is confirmed |
| Styling         | tailwindcss + @tailwindcss/vite                                            | 4.3.5                   | Utilities mapped to semantic CSS tokens in one file, so the AENIX theme can be swapped in later                                                                             |
| Fonts           | @fontsource-variable/dm-sans + @fontsource/ibm-plex-mono                   | 5.3.0 / 5.3.0           | Fonts from the Figma reference, self-hosted (no runtime CDN, CSP-friendly)                                                                                                  |
| Unit tests      | vitest + @testing-library/react + jsdom                                    | 5.1.1 / 16.3.3 / 31.0.1 | Same toolchain as Vite                                                                                                                                                      |
| E2E / a11y      | @playwright/test + @axe-core/playwright                                    | 1.65.1 / 4.14.0         | Desktop and mobile projects; WCAG 2.1 AA scan                                                                                                                               |
| Lint/format     | eslint 10 + typescript-eslint 8.73 + jsx-a11y + react-hooks; prettier 3.10 | —                       | Includes a lint rule that bans web-storage session tokens                                                                                                                   |
| Runtime/tooling | Node 22+, pnpm 10.28.0                                                     | —                       | `packageManager` + `.nvmrc`                                                                                                                                                 |

**Deferred until needed:** a forms library (React Hook Form + a schema validator, from the first approved form), a data table (TanStack Table, from the first approved list), headless dialog/menu primitives (Radix UI, from the first approved need) and MSW contract mocks (from the first published contract). Adding them before they are needed would put unused dependencies into the foundation.

## Not decided here (explicitly)

- **Session model** (HttpOnly cookie + CSRF vs bearer/refresh). This belongs to ADR-004/SEC-001. The foundation sends `credentials: 'same-origin'` and a correlation ID only, and protected routes deny by default. Frontend requirements are in `docs/API-DEPENDENCIES.md` (API-DEP-01).
- **Hosting topology** (same-origin under IIS vs separate origin plus CORS). This belongs to INF-001. Same-origin is preferred by the frontend because it avoids CORS and keeps cookies first-party.
- **Screen layouts and navigation.** These follow the owner's Figma UI reference (`docs/UI-REFERENCE.md`) and are built per phase gate. The brand palette, type scale and radii from that reference are already applied as tokens in `src/shared/ui/tokens.css`.

## Consequences

- Frontend foundation work can run in parallel with the backend. Business screens start only when their phase is authorized **and** their OpenAPI contract is versioned.
- IIS needs a static-file site with SPA fallback to `index.html` and security headers (CSP, etc.). That is configured with Antigravity/INF-001 at deployment time, not in this package.
