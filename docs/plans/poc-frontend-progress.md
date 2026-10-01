# POC frontend progress

Tracks [`poc-frontend.md`](poc-frontend.md). Update at the end of each stage: status, components added, mocks added, issues raised, validation, and anything unverified.

Status values: `Not started`, `In progress`, `Done`, `Blocked`.

## Stages

| Stage                      | Status      | Notes                                                                                                                                                                                                                                          |
| -------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Design foundation       | Done        | Palette shade scales and colour sets; type, spacing, radius, shadow, icon-size and size tokens; Inter; styles grouped by scope; utility and button classes; icon catalogue additions; mocks convention. Legacy roles mapped to palette shades. |
| 1. Shell and navigation    | Done        | Header and footer removed; centred 480px column; bottom nav on Home, Things, Timeline; top bar on Thing and chat pages; `/things`, `/things/:id/details`, `/things/:id/chat`, `/timeline`, `/profile` routes.                                  |     |
| 2. Sign in                 | Done        | Wordmark, headline, copy, Continue with email, disabled Continue with Apple (#16), terms footnote as plain text (#17); setup-pending state uses `bt-notice`. Login examples, eyebrow and their icons/colour removed.                           |
| 3. Home                    | Done        | Home page at `/` with greeting, promo card, Needs attention, Upcoming, Frequent & recent and Categories; skeleton, empty states and sample-data action. `/things` keeps the dashboard and filters by `categoryId` from the query string.       |
| 3a. App state              | Done        | `@ngrx/signals` stores over domain services in `core/data/`; optimistic mutations with rollback and error toasts (`ngx-toastr`). Home, the dashboard and Profile read the stores. Thing detail, the import panel and chat still call `Api`.    |
| 4. Add Thing               | Not started |                                                                                                                                                                                                                                                |
| 5. Thing detail            | Not started |                                                                                                                                                                                                                                                |
| 6. View all details        | Not started |                                                                                                                                                                                                                                                |
| 7. Chat                    | Not started |                                                                                                                                                                                                                                                |
| 8. Things list and Profile | Not started |                                                                                                                                                                                                                                                |
| 9. Clean-up                | Not started |                                                                                                                                                                                                                                                |

## Shared components and styles

Record each shared component, mixin or token group when added: name, path, first used in.

| Name                                                                                              | Path                                                          | Stage |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----- |
| Palette shade scales (neutral, green, blue, red, amber)                                           | `src/styles/colors/_palette.scss`                             | 0     |
| Colour sets (`<set>`, `-muted`, `-subtle`, `-contrast`)                                           | `src/styles/colors/_theme.scss`                               | 0     |
| `.text-*` and `.bg-*` utilities                                                                   | `src/styles/colors/_utilities.scss`                           | 0     |
| Space, radius, shadow, icon-size and size tokens                                                  | `src/styles/_tokens.scss`                                     | 0     |
| Typography roles and `$font-family`                                                               | `src/styles/typography/_index.scss`                           | 0     |
| Button classes `.button-primary/secondary/accent/link`, sizes `.button-sm/lg`                     | `src/styles/_buttons.scss`                                    | 0     |
| `.icon-sm/md/lg`                                                                                  | `src/styles/_icons.scss`                                      | 0     |
| Mixins `icon-size`, `list-row`, `key-value-row`                                                   | `src/styles/_mixins.scss`                                     | 0     |
| `bt-icon-button` (`button[btIconButton]`, `a[btIconButton]`)                                      | `src/app/components/icon-button/`                             | 1     |
| `bt-top-bar`                                                                                      | `src/app/components/top-bar/`                                 | 1     |
| `bt-bottom-nav`                                                                                   | `src/app/components/bottom-nav/`                              | 1     |
| `bt-placeholder-page`                                                                             | `src/app/components/placeholder-page/`                        | 1     |
| Size tokens `bottom-nav`, `content-max`                                                           | `src/styles/_tokens.scss`                                     | 1     |
| `bt-notice` (`tone`, `icon`, `busy`, `[noticeDetail]` secondary line)                             | `src/app/components/notice/`                                  | 2     |
| `bt-section-header`                                                                               | `src/app/components/section-header/`                          | 3     |
| `bt-icon-badge`                                                                                   | `src/app/components/icon-badge/`                              | 3     |
| `bt-list-row`                                                                                     | `src/app/components/list-row/`                                | 3     |
| `bt-card-group`                                                                                   | `src/app/components/card-group/`                              | 3     |
| `bt-date-tile`                                                                                    | `src/app/components/date-tile/`                               | 3     |
| `bt-event-card`                                                                                   | `src/app/components/event-card/`                              | 3     |
| `bt-thing-thumbnail`                                                                              | `src/app/components/thing-thumbnail/`                         | 3     |
| `bt-thing-row`                                                                                    | `src/app/components/thing-row/`                               | 3     |
| `bt-category-chip`                                                                                | `src/app/components/category-chip/`                           | 3     |
| `bt-promo-card`                                                                                   | `src/app/components/promo-card/`                              | 3     |
| `bt-icon-button` `plain` variant                                                                  | `src/app/components/icon-button/`                             | 3     |
| `typography.weight()`; size tokens `icon-badge`, `thumbnail-sm`, `thumbnail-md`                   | `src/styles/`                                                 | 3     |
| `relativeTime` pipe                                                                               | `src/app/pipes/relative-time.pipe.ts`                         | 3     |
| Category icons keyed by `Category.icon`, `categoryIcon()`                                         | `src/app/core/app-icons.ts`, `src/app/utils/category.util.ts` | 3     |
| `Toasts` service, `ACTION_TERMS`, `ERROR_TERMS`                                                   | `src/app/core/services/toasts.service.ts`, `app-terms.ts`     | 3a    |
| Toast styles                                                                                      | `src/styles/_toasts.scss`                                     | 3a    |
| Stores, `withEntityCollection`, `withOptimisticEntities`, `withLoad`, `withSession`, shared views | `src/app/core/state/`                                         | 3a    |
| Domain services                                                                                   | `src/app/core/data/`                                          | 3a    |

## Mocks

Each active mock, its path and the Backend issue that removes it.

| Mock                             | Path                                    | Issue |
| -------------------------------- | --------------------------------------- | ----- |
| Issue kind and due-date ordering | `src/app/core/mocks/issue-kind.mock.ts` | #9    |
| Creates wait for server IDs      | `src/app/core/mocks/client-ids.mock.ts` | #34   |

## Issues

Open issues raised by this plan. Mark each when closed and its mock removed.

| Issue | Label    | Stage | Status |
| ----- | -------- | ----- | ------ |
| #6    | Backend  | 5, 6  | Closed |
| #7    | Backend  | 5     | Closed |
| #8    | Backend  | 3     | Closed |
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
| #34   | Backend  | 3a    | Open   |
| #35   | Backend  | 7     | Open   |

## Decisions

Decisions made during implementation that refine the plan.

- Colours: each design colour anchors a 50–900 shade scale in `colors/_palette.scss`; missing shades are interpolated. Colour sets in `colors/_theme.scss` (primary, secondary, accent, info, danger, warning) reference shades. Legacy roles are mapped to the nearest shade.
- Inter loads from Google Fonts in `src/index.html` (weights 400–700).
- `display` is 32px; larger design display sizes snap to it.
- Button styles: `.button-primary` is the dark pill, `.button-accent` uses `accent-muted` with `primary` text.
- Bottom nav visibility is route data (`bottomNav: true`), read by the shell from the deepest active route.
- `/things` and `/things/:id/details` load the existing dashboard and Thing page until stages 8 and 6 rebuild them. Profile is a placeholder holding Sign out until stage 8.
- Home is its own page (`features/home/`); the dashboard stays at `/things` until stage 8. Home rows link to the Thing; resolve, schedule and complete stay on the Thing page.
- Issue kind badges: renewal alert (info), warranty shield (accent), fault warning (warning), other information (neutral).
- `bt-list-row` is the base row: `bt-event-card` and `bt-thing-row` compose it. Linked rows use a stretched title link so trailing controls stay separate actions.
- Event card radius is `tile` on Home and Thing detail.
- App state: a Thing's detail is stored on its `ThingsStore` record (`detail`) so one optimistic change covers summary and detail. Load and sign-out behaviour are the `withLoad` and `withSession` store features, attached with `withFeature`. Shared error copy moved from `bt-error-message`'s template to `ERROR_TERMS` so toasts reuse it. Category counts and upcoming Events with Thing names are shared views in `core/state/views/`.
- Icon catalogue: nav, row, status, attachment, menu and chat icons are mapped from Lucide names implied by the screen descriptions. Stages 1–7 check each against its design frame and swap where the frame uses a different glyph.

## Unverified

- Stage 3a: the e2e failure spec covers an Issue resolve on the dashboard; Thing rename and Tag delete have no store-backed UI until stage 5. `ConversationsStore`, `PurchasablesStore`, `AttachmentsStore` mutations, `ThingsStore` update/delete/view/watch and `RegistryStore` have no page using them yet; they are covered only by the `optimistic.ts` and `thing-patch.ts` unit tests. Toast screen reader announcement not checked with a screen reader (the container is `aria-live="polite"` and the message `role="alert"`).

- Stage 3: compared with the Home frame at mobile and desktop widths. The bottom nav was not restyled against the frame (active item tint, Add size). Live Logto not exercised.
- Stage 2: sign-in layout and copy are built from the plan's description; no comparison against the design frame. Existing headline and supporting copy kept. Live Logto redirect not exercised; the integration browser test was updated for the renamed button but not run (needs local Supabase).
- Stage 1: nav, top bar and icon button are built from the plan's descriptions; no comparison against the design frames. The existing dashboard, Thing and chat pages are legacy layouts inside the narrower column until their stages rebuild them.
- Stage 0: no visual comparison against the design frames. Token anchors come from the Design alignment table.
