# POC frontend progress

Tracks [`poc-frontend.md`](poc-frontend.md). Update at the end of each stage: status, components added, mocks added, issues raised, validation, and anything unverified.

Status values: `Not started`, `In progress`, `Done`, `Blocked`.

## Stages

| Stage                      | Status      | Notes                                                                                                                                                                                                                                          |
| -------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Design foundation       | Done        | Palette shade scales and colour sets; type, spacing, radius, shadow, icon-size and size tokens; Inter; styles grouped by scope; utility and button classes; icon catalogue additions; mocks convention. Legacy roles mapped to palette shades. |
| 1. Shell and navigation    | Done        | Header and footer removed; centred 480px column; bottom nav on Home, Things, Timeline; top bar on Thing and chat pages; `/things`, `/things/:id/details`, `/things/:id/chat`, `/timeline`, `/profile` routes.                                  |     |
| 2. Sign in                 | Not started |                                                                                                                                                                                                                                                |
| 3. Home                    | Not started |                                                                                                                                                                                                                                                |
| 4. Add Thing               | Not started |                                                                                                                                                                                                                                                |
| 5. Thing detail            | Not started |                                                                                                                                                                                                                                                |
| 6. View all details        | Not started |                                                                                                                                                                                                                                                |
| 7. Chat                    | Not started |                                                                                                                                                                                                                                                |
| 8. Things list and Profile | Not started |                                                                                                                                                                                                                                                |
| 9. Clean-up                | Not started |                                                                                                                                                                                                                                                |

## Shared components and styles

Record each shared component, mixin or token group when added: name, path, first used in.

| Name                                                                          | Path                                   | Stage |
| ----------------------------------------------------------------------------- | -------------------------------------- | ----- |
| Palette shade scales (neutral, green, blue, red, amber)                       | `src/styles/colors/_palette.scss`      | 0     |
| Colour sets (`<set>`, `-muted`, `-subtle`, `-contrast`)                       | `src/styles/colors/_theme.scss`        | 0     |
| `.text-*` and `.bg-*` utilities                                               | `src/styles/colors/_utilities.scss`    | 0     |
| Space, radius, shadow, icon-size and size tokens                              | `src/styles/_tokens.scss`              | 0     |
| Typography roles and `$font-family`                                           | `src/styles/typography/_index.scss`    | 0     |
| Button classes `.button-primary/secondary/accent/link`, sizes `.button-sm/lg` | `src/styles/_buttons.scss`             | 0     |
| `.icon-sm/md/lg`                                                              | `src/styles/_icons.scss`               | 0     |
| Mixins `icon-size`, `list-row`, `key-value-row`                               | `src/styles/_mixins.scss`              | 0     |
| `bt-icon-button` (`button[btIconButton]`, `a[btIconButton]`)                  | `src/app/components/icon-button/`      | 1     |
| `bt-top-bar`                                                                  | `src/app/components/top-bar/`          | 1     |
| `bt-bottom-nav`                                                               | `src/app/components/bottom-nav/`       | 1     |
| `bt-placeholder-page`                                                         | `src/app/components/placeholder-page/` | 1     |
| Size tokens `bottom-nav`, `content-max`                                       | `src/styles/_tokens.scss`              | 1     |

## Mocks

Each active mock, its path and the Backend issue that removes it.

| Mock | Path | Issue |
| ---- | ---- | ----- |

## Issues

Open issues raised by this plan. Mark each when closed and its mock removed.

| Issue | Label    | Stage | Status |
| ----- | -------- | ----- | ------ |
| #6    | Backend  | 5, 6  | Closed |
| #7    | Backend  | 5     | Closed |
| #8    | Backend  | 3     | Open   |
| #9    | Backend  | 3     | Open   |
| #10   | Backend  | 3     | Open   |
| #11   | Backend  | 5     | Open   |
| #12   | Backend  | 5     | Open   |
| #13   | Backend  | 5     | Open   |
| #14   | Backend  | 7     | Open   |
| #15   | Backend  | 7     | Closed |
| #16   | Frontend | 2     | Open   |
| #17   | Frontend | 2     | Open   |
| #18   | Frontend | 3     | Open   |
| #19   | Frontend | 1, 5  | Open   |
| #20   | Frontend | 5     | Open   |
| #21   | Frontend | 7     | Open   |
| #22   | Frontend | 7     | Open   |

## Decisions

Decisions made during implementation that refine the plan.

- Colours: each design colour anchors a 50–900 shade scale in `colors/_palette.scss`; missing shades are interpolated. Colour sets in `colors/_theme.scss` (primary, secondary, accent, info, danger, warning) reference shades. Legacy roles are mapped to the nearest shade.
- Inter loads from Google Fonts in `src/index.html` (weights 400–700).
- `display` is 32px; larger design display sizes snap to it.
- Button styles: `.button-primary` is the dark pill, `.button-accent` uses `accent-muted` with `primary` text.
- Bottom nav visibility is route data (`bottomNav: true`), read by the shell from the deepest active route.
- `/things` and `/things/:id/details` load the existing dashboard and Thing page until stages 8 and 6 rebuild them. Profile is a placeholder holding Sign out until stage 8.
- Icon catalogue: nav, row, status, attachment, menu and chat icons are mapped from Lucide names implied by the screen descriptions. Stages 1–7 check each against its design frame and swap where the frame uses a different glyph.

## Unverified

- Stage 1: nav, top bar and icon button are built from the plan's descriptions; no comparison against the design frames. The existing dashboard, Thing and chat pages are legacy layouts inside the narrower column until their stages rebuild them.
- Stage 0: no visual comparison against the design frames. Token anchors come from the Design alignment table.
