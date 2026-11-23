# AENIX ERP — UI Reference Record

Version 0.1 | 2026-11-23 | FE-P0-001

## Source

- **Owner-supplied UI reference:** Figma "Aenix - Freightdesk". File key `N8vJQJUHGkxDhQqhiHBJ4M`; reference node `40:882` ("Enquiry"). The owner shared it in the Claude session on 2026-11-23 with the instruction: "this logo, this color need to keep, with white".
- Pages: `Design` (0:1) and `Icons` (27:549). Frames seen (read-only): Splash screen, Sign in (+ forgot password / check mail / new password), Home, Home v02, Enquiry, Enquiry - Form, Header.
- **Logo:** authentic raster logo taken from the Figma file's own image fill (864×289 PNG, transparent), stored at `src/assets/aenix-logo.png`. It matches the logo the owner sent in chat. Do not recolour, redraw or vectorise it without owner approval. **Open:** an official SVG/vector master is preferred for sharp rendering.

## Tokens applied (`src/shared/ui/tokens.css`)

Taken from the Figma variables on node 40:882:

| Figma variable                        | Value                                          | Semantic token                                                 |
| ------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------- |
| Surface/Default                       | #ffffff                                        | `--color-surface`                                              |
| Surface/Canvas                        | #f7f7f7                                        | `--color-canvas`                                               |
| Surface/Inverse, Text/Primary         | #1a1a1a                                        | `--color-surface-inverse`, `--color-fg`, `--color-primary`     |
| Text/Secondary, Icon/Primary          | #3a3332                                        | `--color-fg-secondary`                                         |
| Text/Muted, Icon/Secondary            | #524847                                        | `--color-fg-muted`                                             |
| Icon/Disabled                         | #8b8584                                        | `--color-fg-disabled`                                          |
| Border/Default · Subtle · Strong      | #c9c6c6 · #eeeded · #756d6c                    | `--color-border*`                                              |
| Surface/Brand, Text/Brand, Icon/Brand | **#9a2119** (AENIX red; logo pixels ≈ #a0241c) | `--color-brand`, `--color-focus`                               |
| Surface/Brand Subtle                  | #faf4f4                                        | `--color-brand-subtle`                                         |
| Text/Warning · Surface/Warning        | #c2410c · #fff7ed                              | `--color-warning*`                                             |
| Text/Success · Surface/Success        | #047857 · #ecfdf5                              | `--color-success*`                                             |
| Font Family/Body, Headings            | DM Sans                                        | `--font-sans` (self-hosted via `@fontsource-variable/dm-sans`) |
| Font Family/Mono                      | IBM Plex Mono                                  | `--font-mono` (self-hosted via `@fontsource/ibm-plex-mono`)    |
| Heading M · Body S · Caption          | 32/40 · 14/18 · 12/14                          | `text-heading-m`, `text-body-s`, `text-caption`                |
| Border radius Small/Medium/Large/Full | 4/8/16/999                                     | `rounded-sm/md/lg/full`                                        |
| Scale/100                             | 4                                              | `--spacing` base unit                                          |

Logo wordmark charcoal (≈ #4c4c4c, sampled) is recorded as `--palette-logo-charcoal`. The UI text colours follow the Figma variables, not the logo pixel.

## Not defined in the reference (confirm with owner)

- A separate **danger/error** colour. It currently reuses the brand red, which could make "error" and "brand" look alike.
- An **info** colour (currently placeholder blue).
- **Dark theme**. A "dark" frame exists, but there are no dark variables. Provisional values are opt-in only.

## Observations for future screens (NOT implemented; each needs its phase gate + contract)

- Layout: rounded top header (logo, global search with Ctrl K, notifications, settings, avatar), a floating icon side rail with the active item in brand red, a canvas background and white rounded content cards.
- Lists: status tabs (pill chips), search, customer filter and filters button; a table with a mono document-reference style (QT-/JOB-/INV-) in brand red; status badges using the subtle backgrounds; "next step" action links; and a footer with paging ("Showing 1–5 of 5", 25 / page).
- The sample data in the Figma file (customer names, amounts, document numbers) is **illustrative only** and must never be used as seed or demo data.
