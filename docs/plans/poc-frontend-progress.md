# POC frontend progress

Tracks [`poc-frontend.md`](poc-frontend.md). Update at the end of each stage: status, components added, mocks added, issues raised, validation, and anything unverified.

Status values: `Not started`, `In progress`, `Done`, `Blocked`.

## Stages

| Stage                      | Status      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Design foundation       | Done        | Palette shade scales and colour sets; type, spacing, radius, shadow, icon-size and size tokens; Inter; styles grouped by scope; utility and button classes; icon catalogue additions; mocks convention. Legacy roles mapped to palette shades.                                                                                                                                                                                        |
| 1. Shell and navigation    | Done        | Header and footer removed; centred 480px column; bottom nav on Home, Things, Tasks; top bar on Thing and chat pages; `/things`, `/things/:id/details`, `/things/:id/chat`, `/tasks`, `/profile` routes.                                                                                                                                                                                                                               |     |
| 2. Sign in                 | Done        | Wordmark, headline, copy, Continue with email, disabled Continue with Apple (#16), terms footnote as plain text (#17); setup-pending state uses `bt-notice`. Login examples, eyebrow and their icons/colour removed.                                                                                                                                                                                                                  |
| 3. Home                    | Done        | Home page at `/` with greeting, promo card, Needs attention, Upcoming, Frequent & recent and Categories; skeleton, empty states and sample-data action. Category chips open `/things?categoryId=`.                                                                                                                                                                                                                                    |
| 3a. App state              | Done        | `@ngrx/signals` stores over domain services in `core/data/`; optimistic mutations with rollback and error toasts (`ngx-toastr`). Home, the Things list and Profile read the stores. Thing detail, the import panel and chat still call `Api`.                                                                                                                                                                                         |
| 4. Add Thing               | Done        | Add Thing page with option tiles, privacy notice and manual link; paste-text step and manual form on their own routes. Creation and imports go through `ThingsStore` (`create`, `startImport`, `confirmImport`, `retryImport`); the Thing page has no new-Thing mode.                                                                                                                                                                 |
| 5. Thing detail            | Done        | Thing page with hero, sheet, Needs attention, Key details, Upcoming and Suggested tasks, Compatible products and Attachments; overflow and attachment menus with dialogs; discovering and processing states with import steps. All writes go through the stores. The previous field editor moved to `/things/:id/details` as All details until stage 6 restyles it. Status summary built but not placed (no backend data).            |
| 6. View all details        | Done        | All details page with Thing details card (name, category, description) and one card per field section, other details and custom fields; pin icon on pinned keys; row menus with Edit (disabled, #51), Pin/Unpin, Reveal/Hide and Delete with confirmation. Top-bar Edit disabled. Value editing, sections and custom-field management moved to #51. Thing overflow item renamed All details.                                          |
| 7. Chat                    | Done        | One page for global and Thing chat on `ConversationsStore`: Thing context card, user bubbles with time, Markdown answers, resource cards read from their stores (Thing, field, attachment, Event, Issue, purchasable) with schedule, complete, resolve and download; retry; composer with disabled attach (#21); disabled overflow (#22). Chat-created records load into their stores. No `Api` calls remain outside domain services. |
| 8. Things list and Profile | In progress | Things list at `/things` (`features/all-things/`): title, search over name and description, category chips (selected chip links back to the unfiltered list) and Thing rows; skeleton and empty states. Bottom nav keeps Things active while filtered. Profile not started.                                                                                                                                                           |
| 9. Clean-up                | Not started |                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## Shared components and styles

Record each shared component, mixin or token group when added: name, path, first used in.

| Name                                                                                              | Path                                                            | Stage |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----- |
| Palette shade scales (neutral, green, blue, red, amber)                                           | `src/styles/colors/_palette.scss`                               | 0     |
| Colour sets (`<set>`, `-muted`, `-subtle`, `-contrast`)                                           | `src/styles/colors/_theme.scss`                                 | 0     |
| `.text-*` and `.bg-*` utilities                                                                   | `src/styles/colors/_utilities.scss`                             | 0     |
| Space, radius, shadow, icon-size and size tokens                                                  | `src/styles/_tokens.scss`                                       | 0     |
| Typography roles and `$font-family`                                                               | `src/styles/typography/_index.scss`                             | 0     |
| Button classes `.button-primary/secondary/accent/link`, sizes `.button-sm/lg`                     | `src/styles/_buttons.scss`                                      | 0     |
| `.icon-sm/md/lg`                                                                                  | `src/styles/_icons.scss`                                        | 0     |
| Mixins `icon-size`, `list-row`, `key-value-row`                                                   | `src/styles/_mixins.scss`                                       | 0     |
| `bt-icon-button` (`button[btIconButton]`, `a[btIconButton]`)                                      | `src/app/components/icon-button/`                               | 1     |
| `bt-top-bar`                                                                                      | `src/app/components/top-bar/`                                   | 1     |
| `bt-bottom-nav`                                                                                   | `src/app/components/bottom-nav/`                                | 1     |
| `bt-placeholder-page`                                                                             | `src/app/components/placeholder-page/`                          | 1     |
| Size tokens `bottom-nav`, `content-max`                                                           | `src/styles/_tokens.scss`                                       | 1     |
| `bt-notice` (`tone`, `icon`, `busy`, `[noticeDetail]` secondary line)                             | `src/app/components/notice/`                                    | 2     |
| `bt-section-header`                                                                               | `src/app/components/section-header/`                            | 3     |
| `bt-icon-badge`                                                                                   | `src/app/components/icon-badge/`                                | 3     |
| `bt-list-row`                                                                                     | `src/app/components/list-row/`                                  | 3     |
| `bt-card-group`                                                                                   | `src/app/components/card-group/`                                | 3     |
| `bt-date-tile`                                                                                    | `src/app/components/date-tile/`                                 | 3     |
| `bt-event-card`                                                                                   | `src/app/components/event-card/`                                | 3     |
| `bt-thing-thumbnail`                                                                              | `src/app/components/thing-thumbnail/`                           | 3     |
| `bt-thing-row`                                                                                    | `src/app/components/thing-row/`                                 | 3     |
| `bt-category-chip`                                                                                | `src/app/components/category-chip/`                             | 3     |
| `bt-promo-card`                                                                                   | `src/app/components/promo-card/`                                | 3     |
| `bt-icon-button` `plain` variant                                                                  | `src/app/components/icon-button/`                               | 3     |
| `typography.weight()`; size tokens `icon-badge`, `thumbnail-sm`, `thumbnail-md`                   | `src/styles/`                                                   | 3     |
| `relativeTime` pipe                                                                               | `src/app/pipes/relative-time.pipe.ts`                           | 3     |
| Category icons keyed by `Category.icon`, `categoryIcon()`                                         | `src/app/core/app-icons.ts`, `src/app/utils/category.util.ts`   | 3     |
| `Toasts` service, `ACTION_TERMS`, `ERROR_TERMS`                                                   | `src/app/core/services/toasts.service.ts`, `app-terms.ts`       | 3a    |
| Toast styles                                                                                      | `src/styles/_toasts.scss`                                       | 3a    |
| Stores, `withEntityCollection`, `withOptimisticEntities`, `withLoad`, `withSession`, shared views | `src/app/core/state/`                                           | 3a    |
| Domain services                                                                                   | `src/app/core/data/`                                            | 3a    |
| `bt-option-tile` (`button[btOptionTile]`, `a[btOptionTile]`)                                      | `src/app/components/option-tile/`                               | 4     |
| `bt-notice` detail-only layout (empty main line hidden)                                           | `src/app/components/notice/`                                    | 4     |
| `addFirstThing` route guard, `Auth.takeSignInLanding()`                                           | `src/app/core/services/first-thing.guard.ts`                    | 4     |
| `importsEnabled` route guard                                                                      | `src/app/core/services/imports.guard.ts`                        | 4     |
| `bt-hero`, `bt-sheet` (`arrive` slide-up)                                                         | `src/app/components/hero/`, `src/app/components/sheet/`         | 5     |
| `bt-status-summary`, `bt-status-tile` (not placed)                                                | `src/app/components/status-summary/`                            | 5     |
| `bt-key-value-row`                                                                                | `src/app/components/key-value-row/`                             | 5     |
| `bt-menu`, `btMenuItem`                                                                           | `src/app/components/menu/`                                      | 5     |
| `bt-dialog`                                                                                       | `src/app/components/dialog/`                                    | 5     |
| `bt-thing-thumbnail` `fill` size; `bt-icon-button` `accent` variant                               | `src/app/components/`                                           | 5     |
| `.button-danger`; mixins `skeleton-line`, `skeleton-circle`, `hero-scrim`; icon size `artwork`    | `src/styles/`                                                   | 5     |
| Field icons (`fieldIcons`, `fieldIcon()`)                                                         | `src/app/core/app-icons.ts`, `src/app/utils/field-icon.util.ts` | 5     |
| `bt-key-value-row` label and end slots; `bt-icon-button`, `bt-menu` `size`                        | `src/app/components/`                                           | 6     |
| `bt-thing-card`                                                                                   | `src/app/components/thing-card/`                                | 7     |
| `bt-rich-text` (`marked`, DOMPurify)                                                              | `src/app/components/rich-text/`                                 | 7     |
| `bt-schedule-dialog`                                                                              | `src/app/components/schedule-dialog/`                           | 7     |
| `bt-chat-bubble`, `bt-chat-composer`                                                              | `src/app/features/chat/`                                        | 7     |
| `bt-icon-button` `primary` variant; radius `tail`; size `composer-max`                            | `src/app/components/icon-button/`, `src/styles/_tokens.scss`    | 7     |

## Mocks

Each active mock, its path and the Backend issue that removes it.

| Mock                              | Path                                          | Issue |
| --------------------------------- | --------------------------------------------- | ----- |
| Issue kind and due-date ordering  | `src/app/core/mocks/issue-kind.mock.ts`       | #9    |
| Creates wait for server IDs       | `src/app/core/mocks/client-ids.mock.ts`       | #34   |
| Event kind and recurrence         | `src/app/core/mocks/event-recurrence.mock.ts` | #100  |
| Tasks, Thing dates and follow-ups | `src/app/core/mocks/tasks.mock.ts`            | #100  |
| Saved-document card               | `src/app/core/mocks/saved-document.mock.ts`   | #14   |

## Issues

Open issues raised by this plan. Mark each when closed and its mock removed.

| Issue | Label    | Stage | Status |
| ----- | -------- | ----- | ------ |
| #6    | Backend  | 5, 6  | Closed |
| #7    | Backend  | 5     | Closed |
| #8    | Backend  | 3     | Closed |
| #9    | Backend  | 3     | Open   |
| #10   | Backend  | 3     | Open   |
| #11   | Backend  | 5     | Closed |
| #12   | Backend  | 5     | Closed |
| #13   | Backend  | 5     | Open   |
| #14   | Backend  | 7     | Open   |
| #15   | Backend  | 7     | Closed |
| #16   | Frontend | 2     | Open   |
| #17   | Frontend | 2     | Open   |
| #18   | Frontend | 3     | Open   |
| #19   | Frontend | 1, 5  | Closed |
| #20   | Frontend | 5     | Open   |
| #21   | Frontend | 7     | Open   |
| #22   | Frontend | 7     | Open   |
| #34   | Backend  | 3a    | Open   |
| #35   | Backend  | 7     | Open   |
| #51   | Frontend | 6     | Open   |
| #59   | Backend  | 7     | Open   |
| #60   | Backend  | 7     | Open   |

## Decisions

Decisions made during implementation that refine the plan.

- Colours: each design colour anchors a 50–900 shade scale in `colors/_palette.scss`; missing shades are interpolated. Colour sets in `colors/_theme.scss` (primary, secondary, accent, info, danger, warning) reference shades. Legacy roles are mapped to the nearest shade.
- Inter loads from Google Fonts in `src/index.html` (weights 400–700).
- `display` is 32px; larger design display sizes snap to it.
- Button styles: `.button-primary` is the dark pill, `.button-accent` uses `accent-muted` with `primary` text.
- Bottom nav visibility is route data (`bottomNav: true`), read by the shell from the deepest active route.
- Profile is a placeholder holding Sign out until stage 8.
- Home is its own page (`features/home/`). Home and Things list rows link to the Thing; resolve, schedule and complete stay on the Thing page.
- Issue kind badges: renewal alert (info), warranty shield (accent), fault warning (warning), other information (neutral).
- `bt-list-row` is the base row: `bt-event-card` and `bt-thing-row` compose it. Linked rows use a stretched title link so trailing controls stay separate actions.
- Event card radius is `tile` on Home and Thing detail.
- App state: a Thing's detail is stored on its `ThingsStore` record (`detail`) so one optimistic change covers summary and detail. Load and sign-out behaviour are the `withLoad` and `withSession` store features, attached with `withFeature`. Shared error copy moved from `bt-error-message`'s template to `ERROR_TERMS` so toasts reuse it. Category counts and upcoming Events with Thing names are shared views in `core/state/views/`.
- Add Thing: the paste-text step and the manual form are routes (`/things/new/text`, `/things/new/manual`) so the browser back button returns to the tiles. Option tiles use the `secondary-subtle` fill with a `secondary` outline; the design's slightly lighter tile fill has no token. Tile labels use regular weight (Inter loads 400–700).
- Imports: `ThingsStore.startImport`, `confirmImport` and `retryImport` resolve after loading the affected Things, so Home and the Things list show them without a reload. The import panel picks existing targets from `ThingsStore` without a separate "Choose existing Things" step.
- Thing detail: Needs attention lists open Issues with a Resolve button. Every section shows all rows; the design's See all links are inert until #18–#20. Suggested tasks and products link their source in the subtitle. Deleting a file from a Thing unlinks it, then deletes it. The Discovering state shows only while an import is `QUEUED` or `EXTRACTING` and the Thing has no values or image; the sheet slides up when details first arrive during the same visit, not on a plain visit. Pins are compared by field, not by JSON (stream snapshots return keys sorted). Thing confirms, refreshes and list loads keep the newer revision, so an older response never overwrites a newer snapshot. Status summary is built but not placed, as the backend does not provide its data.
- All details: pins, reveal and delete live in each row's overflow menu; Thing details rows (name, category, description) offer only Edit. Delete clears a set or standalone field's value and removes a custom field with its pin. `bt-field` is unused until #51. Pin icons are pushpins.
- Chat: the top bar keeps the "Assistant" title on both chats. Thing cards render above the answer text and other cards below it, as in the Global chat frame. The composer field uses radius `card` so it stays rounded when it grows to several lines. Resource cards read records from their stores and call `loadOne` when missing, so chat-created Events and Issues show on the Thing page and Home without a reload. The schedule dialog is the shared `bt-schedule-dialog`. Issue, task and attachment badges and the attachment format live in `app/utils/` and serve Home, the Thing page and chat.
- The shared `back` icon is the left chevron, matching the Add Thing frame.
- Icon catalogue: nav, row, status, attachment, menu and chat icons are mapped from Lucide names implied by the screen descriptions. Stages 1–7 check each against its design frame and swap where the frame uses a different glyph.

## Unverified

- Stage 7: compared with the Thing chat and Global chat frames at mobile and desktop widths. The back control keeps the `surface` icon button (frames: white) and the title stays "Assistant" (frames: "Thing Chat", "Global Chat"). The saved-document card (#14 mock) has no fixture in e2e, since the API never sends it. Markdown rendering is covered by an e2e spec with a stubbed stream; the fixture assistant answers in plain text. Live chats fail for Things whose details are custom fields until #59 and #60 are delivered. Auto-scroll while streaming, Enter-to-send and fitting the page above the on-screen keyboard (the page follows `visualViewport` while the composer has focus) were not checked on a device.
- Stage 6: compared with the View all details frame at mobile and desktop widths. The back control keeps the `surface` icon button (frame: white), row menu triggers are 32px (frame: 28px), and the card has no outline (frame: 1px `neutral-100`). The e2e delete spec uses a text import because the sample Things are shared by other specs. The integration browser test passed with its Add Thing file-chooser loop skipped locally; that loop times out in cloud sessions on main too.
- Stage 5: ready, processing and discovering states compared with their frames at mobile and desktop widths; row dividers are fainter and the Ask pill shorter than the frame. The sheet slide-up was checked in captured frames, not on a device. Chat writes (stage 7) still bypass the stores, so tasks created in chat show on the Thing after a reload. Clipboard copy, the camera tile and live Logto not exercised.
- Stage 4: compared with the Add Thing frame at mobile and desktop widths. The frame's back control is a white circle; `bt-top-bar` keeps the `surface` icon button until a frame using it on another screen is checked. The paste-text step and manual form have no design frame. Physical-device camera capture and live Logto not exercised; the post-sign-in redirect for an empty account needs the Logto callback, so only the "Add your first thing" headline is covered by e2e.
- Stage 3a: the e2e failure spec covers an Issue resolve on the dashboard; Thing rename and Tag delete have no store-backed UI until stage 5. `ConversationsStore`, `PurchasablesStore`, `AttachmentsStore` mutations, `ThingsStore` update/delete/view/watch and `RegistryStore` have no page using them yet; they are covered only by the `optimistic.ts` and `thing-patch.ts` unit tests. Toast screen reader announcement not checked with a screen reader (the container is `aria-live="polite"` and the message `role="alert"`).

- Stage 3: compared with the Home frame at mobile and desktop widths. The bottom nav was not restyled against the frame (active item tint, Add size). Live Logto not exercised.
- Stage 2: sign-in layout and copy are built from the plan's description; no comparison against the design frame. Existing headline and supporting copy kept. Live Logto redirect not exercised; the integration browser test was updated for the renamed button but not run (needs local Supabase).
- Stage 1: nav, top bar and icon button are built from the plan's descriptions; no comparison against the design frames. The existing dashboard, Thing and chat pages are legacy layouts inside the narrower column until their stages rebuild them.
- Stage 0: no visual comparison against the design frames. Token anchors come from the Design alignment table.
