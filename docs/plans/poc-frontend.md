# POC frontend

Rebuild the Angular client against the [Boring Things POC Figma file](https://www.figma.com/design/SV6xV538vbD2Vn5f1EF1rR/Boring-Things-POC?node-id=0-1). Scope follows the POC screens in [Milestones](../requirements/roadmap/MILESTONES.md). Progress is tracked in [`poc-frontend-progress.md`](poc-frontend-progress.md).

Inputs: [scaffolding plan](poc-scaffolding.md), [frontend guide](../../src/AGENTS.md), [issue conventions](../agents/github-issues.md), `openapi.json`.

Issues created during a stage go in the `POC` milestone when [Milestones](../requirements/roadmap/MILESTONES.md) puts the change in the POC. Future work, including enhancements left inert and Backend changes the POC can mock, gets no milestone.

## Principles

- **Tokens first.** Every colour, font size, weight, line height, spacing, radius, shadow and icon size comes from `src/styles/` tokens. No literal values in component styles.
- **Components on first encounter.** When a pattern first appears, build it as a shared component or mixin in that stage and record it in the component inventory below. Later stages reuse it; they do not restyle a copy.
- **Align, do not copy.** Figma values are snapped to the token scale. Deviations are listed under [Design alignment](#design-alignment) and resolved once in stage 0.
- **Mock behind a seam.** When the design needs data or behaviour the API lacks, the frontend maps API responses to view models and fills gaps from a labelled mock in `src/app/core/mocks/`. Each mock names its Backend issue. Removing the mock is part of closing that issue.
- **Unprovisioned features are inert.** Controls for features outside the POC render as designed, are disabled or open a placeholder page, and have an issue of type `Feature`.
- **Existing behaviour is preserved** and re-homed where the design has no slot: import progress, sensitive reveal, pins, tags, custom fields, section add/remove, category correction, attachment link/unlink/set image, event scheduling/completion, issue resolution, chat retry, sample labels. See [Re-homed features](#re-homed-features).
- Phone first (393 px frame). Wider viewports use a centred column capped at a max width token; no separate desktop layout in the POC.

## Screens

Node: Figma frame ID.

| Screen                        | Node     | Route                   |
| ----------------------------- | -------- | ----------------------- |
| Sign in and register          | `9:2202` | `/login`                |
| Home                          | `9:2243` | `/`                     |
| Add Thing                     | `9:2362` | `/things/new`           |
| Thing detail — discovering    | `27:19`  | `/things/:id`           |
| Thing detail — processing     | `23:610` | `/things/:id`           |
| Thing detail                  | `9:2481` | `/things/:id`           |
| Status summary (component)    | `9:2507` | Thing detail            |
| View all details              | `9:2642` | `/things/:id/details`   |
| Thing chat                    | `9:2771` | `/things/:id/chat`      |
| Global chat                   | `9:2776` | `/chat`                 |
| Things list (no design)       | —        | `/things`               |
| Timeline, Profile (no design) | —        | `/timeline`, `/profile` |

### Sign in and register

- Brand wordmark, display headline, supporting copy; primary pill **Continue with email** (Logto redirect), secondary outline pill **Continue with Apple**, terms footnote.
- Setup-pending state stays, restyled.
- Apple sign-in and Terms/Privacy pages are inert (tracked as `Feature` issues).

### Home

- Time-of-day greeting with `Profile.displayName`; profile icon links to `/profile`.
- **Ask a question** promo card opens global chat.
- **Needs attention**: up to 3 open Issues (`GET /issues?status=OPEN`), leading icon badge by kind, title, subtitle from `statusText`/`dueDate` countdown. **See all** is inert.
- **Upcoming**: next scheduled Event with date tile, Thing name and relative time. **View Timeline** links to `/timeline`.
- **Frequent & recent**: 3 Thing rows (`GET /things?sort=RECENTLY_VIEWED`), thumbnail, category, **New** marker. **All Things** links to `/things`.
- **Categories**: 2-column chips with icon, name and `thingCount`; each links to `/things?categoryId=`.
- Bottom navigation: Home, Things, Add (primary), Timeline, Ask.
- Empty states for each section; sample-data action for an empty account.

### Add Thing

- Top bar with back; display title and supporting copy.
- 2×2 option tiles: Camera, Photos, Files, Text. Camera/Photos/Files open the matching file input; Text opens a paste-text step (no design; composed from existing components).
- Privacy notice banner.
- **Enter details manually** text link below the tiles opens the existing manual creation form.
- Disabled tiles when AI imports are unconfigured; manual entry stays available.

### Thing detail

Three states of one page, driven by the Thing stream.

- **Discovering**: hero gradient with centred "Identifying your Thing…", back and overflow controls. Shown until the import names the Thing.
- **Processing**: hero image, resting sheet with category, name and model subtitle; **Finding useful details** notice with spinner ("You can leave this screen"); sections render labels with skeleton values; populated rows replace skeletons as snapshots arrive.
- **Ready**:
  - Hero: Thing image (or category artwork) with top scrim, back and overflow buttons.
  - Resting sheet overlapping the hero: category, name, model subtitle (`common.model`), **Ask** pill opening Thing chat.
  - Status summary: Warranty, Age, Manual tiles. Not shown in the POC: the backend does not provide its data. The component is kept for later.
  - **Key details**: pinned fields as icon/label/value rows. **Copy** copies the rows as text to the clipboard. **See all** opens View all details.
  - **Upcoming tasks**: next scheduled Event card. **See all** inert.
  - **Suggested tasks**: suggested Events with icon badge, title, recurrence; **+** schedules via a date picker (existing schedule behaviour). **See all** inert.
  - **Compatible products**: purchasables with icon badge, name, description and a **Buy** button that opens the merchant URL in a new tab. Sample purchasables show a disabled **Buy**. **See all** inert.
  - **Attachments**: icon by document kind, title, meta line (type · pages · publisher or date), download. **Add** uploads and links a file.
  - Overflow menu: Edit details, Add details from a source, Change category, Tags, Delete.
  - Attachment row menu: Set as image, Unlink, Delete.

### View all details

- Top bar: back, "All details", edit button (disabled until #51).
- **Thing details** card (name, category) followed by one grouped card per field section (existing section grouping), key/value rows with a pin icon on pinned fields and a row overflow menu: Edit (disabled until #51), Pin/Unpin, Delete. Thing details rows offer only Edit.
- Sensitive fields keep Reveal/Hide in the row menu.

### Chat (Thing and global)

- Top bar: back, title, overflow (inert).
- Thing chat starts with a Thing context card. Global chat shows Thing cards inline when referenced.
- User bubbles with time; assistant text rendered as formatted text (headings, lists, emphasis).
- Resource cards restyled: Thing card, field key/value card, saved-document card, Event/Issue/purchasable rows reuse list-row components.
- Composer: pill input with contextual placeholder, attach button (inert), primary send button. Messages send text and a request ID; the backend infers requested actions from the conversation. Streaming, retry and failure states restyled.

### Things list, Timeline, Profile

- Things list: search and category filter, Thing rows. Composed from Home components.
- Timeline: placeholder page (tracked as a `Feature` issue).
- Profile: display name, sign out, add sample data. Composed from existing components.

## Component inventory

Prefix `bt-`. Built in the stage listed; later stages reuse.

| Component / style     | Purpose                                                             | Stage |
| --------------------- | ------------------------------------------------------------------- | ----- |
| Button classes        | Primary, secondary outline, dark-accent pill, text link; sizes      | 0     |
| `bt-icon-button`      | Round icon-only control; surface and elevated variants              | 1     |
| `bt-top-bar`          | Back, centred title, trailing action slot                           | 1     |
| `bt-bottom-nav`       | Five-item navigation with primary Add                               | 1     |
| `bt-placeholder-page` | Titled "coming later" page for inert destinations                   | 1     |
| `bt-notice`           | Tinted banner with icon, optional spinner and secondary line        | 2     |
| `bt-section-header`   | Title, optional inline action, trailing link or action              | 3     |
| `bt-icon-badge`       | Circular tinted icon (blue, green, neutral, white tones)            | 3     |
| `bt-list-row`         | Icon badge, title, subtitle, trailing chevron/plus/download slot    | 3     |
| `bt-card-group`       | White rounded container with divided rows                           | 3     |
| `bt-event-card`       | Highlighted Event row with date tile or icon badge                  | 3     |
| `bt-date-tile`        | Day/month tile                                                      | 3     |
| `bt-thing-thumbnail`  | Thing image or category artwork at sm/md sizes                      | 3     |
| `bt-thing-row`        | Thumbnail, name, category and New marker, chevron                   | 3     |
| `bt-category-chip`    | Category icon, name and count                                       | 3     |
| `bt-promo-card`       | Dark call-to-action card (Ask a question)                           | 3     |
| `bt-option-tile`      | Icon and label tile in a grid                                       | 4     |
| `bt-hero`             | Full-bleed image with scrim, overlay controls, discovering gradient | 5     |
| `bt-sheet`            | Rounded sheet overlapping the hero                                  | 5     |
| `bt-key-value-row`    | Optional icon, label, value or skeleton                             | 5     |
| `bt-status-summary`   | Row of tinted metric tiles (`bt-status-tile`); built, not placed    | 5     |
| `bt-menu`             | Overflow action menu                                                | 5     |
| `bt-dialog`           | Modal dialog with title, close and actions                          | 5     |
| Skeleton mixins       | Line, circle and row placeholders                                   | 5     |
| `bt-thing-card`       | Thing context card for chat                                         | 7     |
| `bt-chat-bubble`      | User and assistant message layouts                                  | 7     |
| `bt-chat-composer`    | Pill input, attach and send                                         | 7     |
| `bt-rich-text`        | Assistant Markdown rendered with `marked`, sanitised with DOMPurify | 7     |

## Design alignment

Figma variables (source of truth for colour):

| Role                                                | Value       |
| --------------------------------------------------- | ----------- |
| `text/primary`, `surface/primary`, `border/primary` | `#273238`   |
| `text/muted`, `icon/muted`, `border/muted`          | `#76817d`   |
| `text/neutral-200`                                  | `#c8d0cd`   |
| `text/green-600`                                    | `#438d69`   |
| `surface/accent`, `border/accent`                   | `#79c9a1`   |
| `surface/green-100`                                 | `#e0f3e9`   |
| `surface/blue-50`                                   | `#e4f0f6`   |
| `surface/secondary`                                 | `#e3e8e5`   |
| `background/canvas`, `surface/canvas`               | `#f2f4f2`   |
| `border/neutral-100`                                | `#d9dfdb`   |
| `surface/white`                                     | `#ffffff`   |
| `teal/900-4` (chip fill)                            | `#17212614` |

Inconsistencies resolved in stage 0:

- **Chat palette.** Chat frames use a separate grey set (`#111827`, `#6b7280`, `#9ca3af`, `#e4e4e7`, `#f2f2f4`). Map to `text/primary`, `text/muted`, `border/neutral-100` and `surface/canvas`.
- **Type scale.** Figma uses 9, 10, 11, 12, 13, 14, 16, 17, 25, 26 px and larger display sizes. Snap to roles: `display` (headline), `title` (25–26 → one size), `section` (17 bold), `body` (13–14 → one size), `label` (12), `caption` (10–11 → one size), `micro` (9, date tile only). Font: Inter.
- **Spacing.** Gaps of 2, 3, 6, 7, 9, 10, 14, 18, 22, 26 px snap to the 4 px scale (with 2 px kept for tight text stacks).
- **Radii.** 12 (tiles, chips, event card in Thing detail), 18 (cards, event card on Home), 28 (sheet), 999 (pills, badges). Unify event card radius; tokens `tile`, `card`, `sheet`, `pill`.
- **Icon sizes.** 15, 16, 17, 18, 19, 20, 26 px snap to `sm` (16), `md` (20), `lg` (24).
- **Icon set.** Figma uses Lucide-style icons; map each to the nearest Remix icon in `app-icons.ts`.
- **Row heights.** List rows 58 px, key/value rows 39 px; define as mixins.
- **Shadows.** Promo card `0 4 4 / 25%`, floating controls `0 4 14 / 13%`, sheet `0 -8 24 / 8%`. Define `raised`, `floating`, `sheet` shadow tokens.
- Existing one-off colour roles in `_tokens.scss` are removed as each screen migrates; stage 9 deletes any left.

## Stages

Each stage ends with `pnpm format`, `CI=true pnpm check`, relevant browser checks, a mobile and desktop visual check against Figma, and a progress-file update.

### 0. Design foundation

- Replace colour, typography, spacing, radius and shadow maps with the aligned Figma set; load Inter.
- Generate `.text-*` and `.bg-*` utility classes for every role.
- Button classes; icon size tokens; Lucide → Remix mapping in `app-icons.ts`.
- `src/app/core/mocks/` convention: one file per missing capability, header comment naming the Backend issue.
- Rewrite `styles/CHEATSHEET.md`.
- Keep legacy roles aliased so existing screens compile until migrated.

### 1. Shell and navigation

Shell:

- `app.html` renders `<main class="app-main">` with the router outlet and, when the active route asks for it, `bt-bottom-nav`. Header, brand and footer are removed.
- `.app-main` is a centred column capped at `tokens.size(content-max)` (480px) with `space(4)` side padding. Pages with the bottom nav get bottom padding for the nav height and the safe-area inset.
- The bottom nav shows when the deepest active route has `data: { bottomNav: true }`: Home, Things and Timeline. Detail, add, details, chat, profile and login routes leave it out.

Components (`src/app/components/<name>/`):

- `bt-icon-button`: attribute component on `button` and `a` (`button[btIconButton]`, `a[btIconButton]`) so native semantics stay. Inputs: `icon` (catalogue SVG), `label` (accessible name, required), `variant` `surface` (`secondary-muted` fill) or `elevated` (white fill, `floating` shadow). 44px circle, `md` icon, visible focus.
- `bt-top-bar`: three-column bar. Optional `back` link (router commands) rendered as an icon button with `backLabel` (default "Back"); centred `title` as the page `h1`; trailing content projected into the end slot. Stays in flow at the top of the page.
- `bt-bottom-nav`: fixed to the bottom of the column. Links Home `/`, Things `/things`, Add `/things/new`, Timeline `/timeline`, Ask `/chat`. Items show an icon over a `caption` label; the active item uses the filled icon and `aria-current="page"`. Add is a raised `primary` circle with the plus icon and the accessible name "Add a thing".
- `bt-placeholder-page`: `bt-top-bar` with optional back, an icon badge, a title and projected copy explaining the page is coming later.

Routes:

| Route                 | Page                                        | Bottom nav |
| --------------------- | ------------------------------------------- | ---------- |
| `/`                   | Dashboard (rebuilt as Home in stage 3)      | Yes        |
| `/things`             | Dashboard (rebuilt as Things list, stage 8) | Yes        |
| `/things/new`         | Thing page                                  | No         |
| `/things/:id`         | Thing page                                  | No         |
| `/things/:id/details` | Thing page (rebuilt in stage 6)             | No         |
| `/things/:id/chat`    | Chat, Thing context from the route          | No         |
| `/chat`               | Chat                                        | No         |
| `/timeline`           | Placeholder (#19)                           | Yes        |
| `/profile`            | Placeholder with Sign out                   | No         |

Existing pages:

- Dashboard heading drops its Ask and Add buttons (the bottom nav carries both) and gains a profile icon button linking to `/profile`.
- Thing page replaces its back link with `bt-top-bar` (back to `/`). Its Ask link points at `/things/:id/chat`.
- Chat replaces its heading and links with `bt-top-bar`: title "Assistant", back to the Thing when it has one, otherwise to `/`. The Thing context comes from the `:id` route parameter.
- Sign out moves from the header to `/profile` until stage 8 rebuilds Profile.

Validation: `CI=true pnpm check`; browser test updated for the moved links; mobile (390px) and desktop screenshots of Home, Timeline, Profile, Thing and Chat.

### 2. Sign in

One page at `/login` (and `/callback` while the redirect is handled) with four states chosen in the template: signed out, signed in, setup pending and authentication error.

Layout (`features/login/`):

- Full-height column inside `.app-main`: wordmark at the top; headline, supporting copy and actions pushed to the lower part of the screen; terms footnote last.
- Wordmark: `APP_TERMS.appName` in the `section` role. Not a link; this is the only page before sign-in.
- Headline: page `h1` in the `display` role. Supporting copy in `body`, `primary-muted`. Existing copy is kept.
- Actions stack full width with `space(3)` between them:
  - **Continue with email**: `.button-primary` with the mail icon; calls `Auth.signIn()` (Logto redirect, which offers sign-in and registration).
  - **Continue with Apple**: `.button-secondary` with the Apple icon, disabled (#16), with visually hidden "(coming soon)".
- Terms footnote in `caption`, `primary-muted`, centred, shown only with the sign-in actions: "By continuing you agree to the Terms and Privacy Policy." Terms and Privacy Policy are plain text until their pages exist (#17).
- The Home/Vehicles/Memberships examples and the eyebrow are removed; the design has no slot for them.

States:

| State                    | Actions area                                                          |
| ------------------------ | --------------------------------------------------------------------- |
| Signed out, Logto set up | Continue with email, disabled Continue with Apple                     |
| Signed in                | `.button-primary` link **Open your things** to `/`                    |
| Setup pending (no Logto) | `bt-notice` (info): "Sign-in setup is pending." with a secondary line |
| Authentication error     | `bt-error-message` at the top of the actions; actions stay available  |

Component (`src/app/components/notice/`):

- `bt-notice`: tinted banner, reused by Add Thing (privacy notice) and Thing detail (processing notice). Inputs: `tone` (`info`, `accent`, `warning`, `danger`; default `info`) picks the `<tone>-subtle` fill and `<tone>` icon colour; `icon` (catalogue SVG, host registers it); `busy` shows a spinning loader in place of the icon. Default content is the main line in `body`; content marked `noticeDetail` is the secondary line in `caption`, `primary-muted`. Radius `tile`, padding `space(3)` `space(4)`. Hosts add `role="status"` when the notice changes live.

Clean-up: remove the `homeExample`, `vehicleExample` and `membershipExample` icons and the `text-login-example` legacy colour once unused. Add `signInWithEmail`, `signInWithApple` and `setupNotice` icons.

Validation: `CI=true pnpm check`; browser test updated for the renamed sign-in button; mobile (390px) and desktop screenshots of the signed-out and setup-pending states.

### 3. Home

New page `features/home/` at `/`. `/things` keeps the dashboard until stage 8; it reads `categoryId` from the query string so category chips land filtered.

Data (one parallel load; each section renders as its data arrives with the rest of the page):

| Section           | Source                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| Greeting          | `GET /profile` `displayName`; period (morning before 12:00, afternoon before 18:00, evening) from the local time |
| Needs attention   | `GET /issues?status=OPEN&limit=<apiPageSize>`, ordered by due date and cut to `activityLimit` in the #9 mock     |
| Upcoming          | `GET /events?status=SCHEDULED&from=now&limit=1`, then `GET /things/{id}` for the Thing name                      |
| Frequent & recent | `GET /things?sort=RECENTLY_VIEWED&limit=3`                                                                       |
| Categories        | `GET /categories` (all pages); `Category.icon` keys map to catalogue icons                                       |

Layout, top to bottom, `space(6)` between sections:

- Greeting row: "Good morning, {displayName}" in `title` at regular weight; plain profile icon button linking to `/profile`.
- Promo card linking to `/chat`: chat icon, "Ask a question" in `accent-muted`, supporting copy in `caption`.
- **Needs attention**: section header with inert **See all** (#18); card group of list rows. Icon badge by kind: renewal alert (info), warranty shield (accent), fault warning (warning), other information (neutral). Subtitle: `statusText`, due date and day countdown. Rows link to the Thing, where resolve stays. Empty: "Nothing needs attention."
- **Upcoming**: header with **View Timeline** to `/timeline`; event card with date tile, title, "{Thing} · {relative time}", linking to the Thing. Empty: "Nothing scheduled."
- **Frequent & recent**: header with **All Things** to `/things`; three Thing rows (thumbnail, name, category, **New** within `newThingDays`, **Sample** label). Empty account: "Add your first thing" link to `/things/new` and, when sample data is enabled and not added, **Add sample data**.
- **Categories**: header; two-column grid of category chips with icon, name and `thingCount`, linking to `/things?categoryId=`.

Loading: a page skeleton shaped like the sections with a visually hidden "Loading" status. Error: `bt-error-message` with Retry.

Components (`src/app/components/<name>/`):

- `bt-section-header`: `h2` title in `section`; projected inline action (`[sectionInline]`) after the title; projected trailing link or action at the end.
- `bt-icon-badge`: 36px circle, `sm` icon. `tone` `info`, `accent`, `warning`, `neutral` or `white` picks the fill.
- `bt-list-row`: list-row mixin. Leading icon badge (`icon`, `tone`) or projected `[rowLeading]`; `title` in `body`; projected `[rowSubtitle]` in `caption`, `primary-muted`; projected `[rowTrailing]`. With `link`, the title is a router link stretched over the row and a chevron ends the row; trailing controls stay clickable above it. Adjacent rows are divided.
- `bt-card-group`: white container, radius `card`, `space(4)` side padding, holding divided rows.
- `bt-date-tile`: white 44px tile, day in `section` at regular weight, month in `micro`, `primary-muted`.
- `bt-event-card`: list row on `accent-subtle`, radius `tile`, leading date tile or icon badge.
- `bt-thing-thumbnail`: `md` 48px (`sm` 40px) tile on `secondary-muted`. Shows the Thing image through an authenticated blob URL (revoked on change and destroy), otherwise the category icon.
- `bt-thing-row`: list row with thumbnail, Thing name and category meta, linking to the Thing.
- `bt-category-chip`: link tile on `secondary-muted`, radius `tile`, category icon, "{name} · {count}" in `label`.
- `bt-promo-card`: `primary` card, radius `card`, `raised` shadow, linking to its route.

Styles: `typography.weight(regular|medium|semibold|bold)` for regular-weight uses of bold roles; size tokens `icon-badge` (36px), `thumbnail-sm` (40px), `thumbnail-md` (48px); `bt-icon-button` gains a `plain` variant (no fill).

Icons: category icons keyed by `Category.icon`; `openProfile` becomes the account circle; `askQuestion` the chat bubble; `issueRenewal` the alert triangle; add `issueWarranty`, `issueFault`, `issueOther`.

Mocks: `issue-kind.mock.ts` (#9) infers kind from the Issue title and description and orders open Issues by due date. Category icon keys are delivered (#8); no mock.

Validation: `CI=true pnpm check`; e2e Home spec (greeting, sections, sample Things, category chip filters `/things`) and dashboard spec moved to `/things`; integration browser test adds sample data from Home; mobile (390px) and desktop screenshots of Home compared with the design frame.

### 3a. App state

- NgRx Signal Store entity stores over domain services; optimistic mutations with rollback and error toasts. See [App state](app-state.md).
- Home, dashboard and Profile move to the stores. Manual creation and imports move in stage 4, Thing detail in stage 5 and chat in stage 7. Until then their writes bypass the stores, so Home and the Things list show those changes only after a reload.

### 4. Add Thing

Three pages in `features/add-thing/`, none with the bottom nav. The Thing page loses its new-Thing mode and only serves `/things/:id`.

| Route                | Page        | Back to       |
| -------------------- | ----------- | ------------- |
| `/things/new`        | Add Thing   | `/`           |
| `/things/new/text`   | Paste text  | `/things/new` |
| `/things/new/manual` | Manual form | `/things/new` |

Add Thing layout, top to bottom:

- `bt-top-bar` with back only.
- Headline "Add a Thing" (page `h1`) in `display` at regular weight, or "Add your first thing" once `ThingsStore` has loaded an empty library; "Give us whatever you have. We'll work out the useful details." in `body`, `primary-muted`.
- "Choose how to add" in `label`, semibold, `primary-muted`.
- 2×2 grid of `bt-option-tile`: **Camera** (image input with `capture="environment"`), **Photos** (image input), **Files** (supported media types), **Text** (link to `/things/new/text`).
- `bt-notice` (accent, shield icon) with "Your uploads are private. You choose what gets saved." as its detail line. A notice with only a detail line hides its empty main line.
- **Enter details manually**: `.button-link` to `/things/new/manual`.

Behaviour:

- First sign-in: the `addFirstThing` guard on `/` loads Things on the first navigation after the Logto callback and sends an empty account to `/things/new`. Later Home visits show Home's empty state.
- Choosing a file calls `ThingsStore.startImport(file)`. While it runs, the tiles are disabled and a busy `bt-notice` reading "Uploading…" replaces the privacy notice inside a `role="status"` region. On success the page navigates to the Thing, whose page shows the import progress. Failures show a toast and leave the page ready to try again.
- With imports unconfigured (`importEnabled` false) the tiles are disabled and an info `bt-notice` says AI import is unavailable; manual entry stays available. The text route redirects to `/things/new`.
- Paste text: `bt-top-bar` titled "Paste text", a labelled textarea, the privacy notice and a `.button-primary` **Import text**, disabled while empty or busy. The text is sent as `pasted-text.txt`.
- Manual form: `bt-top-bar` titled "Enter details manually", the existing name, category, description and "Details to include" controls, and a `.button-primary` **Create thing**. Categories come from `CategoriesStore` and field sets from `RegistryStore`; `ThingsStore.create` saves and the page navigates to the new Thing. A load failure shows `bt-error-message` with Retry.

Components:

- `bt-option-tile`: attribute component on `button` and `a` (`button[btOptionTile]`, `a[btOptionTile]`). Inputs `icon` and `label`. `secondary-subtle` fill, `secondary` outline, radius `tile`, icon `lg` above the label in `body`, centred. Disabled tiles fade like other disabled buttons.

Stores:

- `ThingsStore.startImport(file, thingId?)`: rejects files over `maxUploadBytes` with a `too-large` toast, uploads through `AttachmentsStore.upload`, starts the import and loads the accepted Thing with `loadOne`. Failures toast `importThing`.
- `ThingsStore.retryImport(job)` toasts `retryImport` and loads each Thing in the result.
- The import panel on the Thing page calls this method. Its inline error and new-Thing copy are removed.

Icons: `privacyNotice` becomes the shield check.

Validation: `CI=true pnpm check`; e2e Add Thing spec (tiles, manual creation showing on Home without a reload, tiles disabled when imports are unconfigured); integration browser test updated for the new pages; mobile (390px) and desktop screenshots compared with the design frame.

### 5. Thing detail

Two pages in `features/things/`, neither with the bottom nav.

| Route                 | Page                                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `/things/:id`         | Thing detail (`thing.*`): the designed page in three states                                                                        |
| `/things/:id/details` | All details (`thing-details.*`): the existing name, description, section, field and custom-field editor, until stage 6 restyles it |

Data: the page reads the Thing from `ThingsStore` (`loadOne`, `watch`, `view` once per visit), Issues, Events and attachments from `issuesByThing`, `eventsByThing` and `attachmentsByThing`, purchasables from `PurchasablesStore.loadForThing`, categories from `categoriesView()` and tags from `TagsStore`. A stream snapshot with a new revision reloads the Thing's child collections inside `ThingsStore.watch`, so discovery results appear without the page asking. A failed first load shows `bt-error-message` with Retry; a missing Thing shows "This thing is unavailable." with a link home.

States, chosen from the Thing's import (`detail.import`):

| State       | When                                                                            | Shows                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discovering | Import `QUEUED` or `EXTRACTING` and the Thing has no field values or image      | Full-height hero gradient, back and overflow controls, centred "Identifying your Thing…" (`title`, regular weight) over `bt-import-steps` in a `role="status"` region |
| Processing  | Import `QUEUED`, `EXTRACTING`, `MAPPING`, `DISCOVERING` or `AWAITING_SELECTION` | Ready layout; busy `bt-notice` under the title holding `bt-import-steps`; Key details rows without values and empty sections show skeleton rows                       |
| Ready       | Otherwise                                                                       | Ready layout; a `FAILED` or `INCOMPLETE` import shows a warning `bt-notice` with **Retry import** under the title                                                     |

The Thing page has no multi-Thing confirmation; an import in `AWAITING_SELECTION` shows the processing notice. Writes from the overflow and attachment menus are disabled while an import runs.

Ready layout, top to bottom:

- `bt-hero`: Thing image, or the category icon at `artwork` size, on `secondary-muted`; top scrim; elevated back link (to `/`) and surface overflow menu over it.
- `bt-sheet` overlapping the hero by `hero-overlap`, holding everything below:
  - Category name in `caption`, semibold, `primary-muted`; Thing name as page `h1` in `title` at regular weight; model subtitle from the `common.model` field in `label`, `primary-muted`; **Sample** label when `isSample`. **Ask** pill (`.button-primary` with the chat icon, `accent-muted` text) linking to `/things/:id/chat` when chat is enabled.
  - Import notice (see States).
  - **Needs attention** (only with open Issues): list rows with the Issue kind badge (#9 mock), status and due-date subtitle and a trailing **Resolve** button.
  - **Key details**: section header with inline **Copy** and trailing **See all** link to `/things/:id/details`. Pinned fields as `bt-key-value-row`s: field icon, label, value (masked values as dots, `false` as No, missing as "Not recorded"). Copy writes "Label: value" lines for unmasked pinned values to the clipboard and shows "Copied" for `copiedMs` in a `role="status"` region. Without pins: "Pin details to see them here." with the See all link.
  - **Upcoming tasks**: header with inert **See all** (#19); every scheduled Event, earliest first, as a `bt-event-card` with the event icon, title, "Due {date} · {relative time}" and a trailing **Mark complete** icon button. Empty: "Nothing scheduled."
  - **Suggested tasks**: header with inert **See all** (#19); suggested Events as list rows with a kind badge, title, recurrence subtitle (#11 mock, omitted when unknown) and a trailing **+** icon button that opens the schedule dialog. Hidden when empty and not processing.
  - **Compatible products**: header with inert **See all** (#20); purchasables as list rows with an `accent` badge, name, description and a trailing `.button-accent.button-sm` **Buy** link opening `merchantUrl` in a new tab; sample rows show a disabled **Buy** and "Sample" in the subtitle. Hidden when empty and not processing.
  - **Attachments**: header with an **Add** link opening the Add a file dialog (Upload a file; library files to link, unlinked ones also deletable); list rows with an icon and tone by `documentType`, `title` or filename, meta "{format} · {n} pages · {publisher or document date}", a trailing download icon button and an attachment menu. Empty: "No documents yet."
- Overflow menu: **All details** (link to `/things/:id/details`), **Add details from a source** (when imports are enabled), **Change category**, **Tags**, **Delete**.
- Attachment menu: **Set as image** (images; **Use category image** on the current image), **Unlink**, **Delete**.

Dialogs (`bt-dialog`):

- **Add details from a source**: option tiles Camera, Photos, Files and Text; Text shows a textarea and **Import text**. Calls `ThingsStore.startImport(file, thingId)`; when the import makes another Thing, the page navigates to it.
- **Change category**: category select, the notice that populated fields from incompatible sections are kept as custom fields, **Save**.
- **Tags**: tag toggle chips and a new-tag input; toggles call `ThingsStore.update({ tagIds })`; new tags call `TagsStore.create` and then add the tag.
- **Delete**: "Delete this thing and its activity? Uploaded files stay in your library." with `.button-danger` **Delete thing** and **Keep it**. Deleting navigates to `/`.
- **Schedule**: date input with an optional time; **Schedule** calls `EventsStore.schedule`.
- **Link a file**: library attachments not linked to the Thing as rows with **Link**; unlinked files also offer **Delete**.

All details page: `bt-top-bar` titled "All details" with back to the Thing; the existing basics (name, description), sections, standalone fields, custom fields and "Add details" controls. Pins, values, sections and custom fields save through `ThingsStore.update`; `bt-field` reveals through `ThingsStore.reveal`. Category and tags move to the Thing page's dialogs.

Components (`src/app/components/<name>/`):

- `bt-hero`: full-bleed block of height `hero`, `secondary-muted` fill, top scrim (`mixins.hero-scrim`). Inputs `imageId`, `category` (icon key) and `discovering` (full viewport height, no image). Image shown through `bt-thing-thumbnail` at size `fill`. Projected `[heroStart]` and `[heroEnd]` controls in a top row; default content centred.
- `bt-sheet`: white, full-bleed, top corners `sheet` radius, `sheet` shadow, pulled up by `hero-overlap`, filling the rest of the viewport. `arrive` slides it up from below the viewport as it first renders (none under reduced motion). The Thing page sets it only when the same visit saw the Discovering state, so the sheet arrives with the first details but not on a plain visit.
- `bt-import-steps` (things feature): the current import stage in words ("Waiting to start", "Reading your source", "Waiting for your choice", "Adding details", "Finding useful details", prefixed for screen readers with "Step n of 3") over a three-segment track: read the source (`QUEUED`, `EXTRACTING`), add details (`AWAITING_SELECTION`, `MAPPING`), find more (`DISCOVERING`). Done and current segments are `accent`, the current one pulses; upcoming segments are `secondary`.
- `bt-status-summary` and `bt-status-tile`: a three-column row of tiles; each tile has `icon`, `label`, `tone` (`accent` or `neutral`) and projected value in `label`, bold. Not placed on the Thing page, since the backend does not provide its data; `warrantyStatus` and `thingAge` in `thing.view.ts` derive tile values from `common.warrantyEnds` and `common.acquiredOn` for when it returns.
- `bt-key-value-row`: key/value mixin row with optional `icon` (`sm`, `primary-muted`), `label` in `label`, `primary-muted`, projected value in `label`, right-aligned; `loading` shows a skeleton line. Adjacent rows are divided.
- `bt-menu`: icon-button trigger (`icon`, `label`, `variant`) and a popover of projected `button[btMenuItem]`/`a[btMenuItem]` items with `role="menu"`. Opens below the trigger aligned to its end; arrow keys move focus; Escape, an outside click or choosing an item closes it and returns focus to the trigger.
- `bt-dialog`: native modal `<dialog>` with an `h2` title, a close icon button and projected content and `[dialogActions]`. `open` input; `closed` output on Escape, backdrop click or close. White, radius `card`, `space(5)` padding, width capped at `content-max`.
- Skeleton mixins: `mixins.skeleton-line` and `mixins.skeleton-circle(size)` on `secondary-muted`, radius `pill`. The page's skeleton rows (`thing-skeleton`) use them in the shape of list rows and key/value rows.

Styles: size tokens `hero` (400px) and `hero-overlap` (104px); icon size `artwork` (96px); `bt-thing-thumbnail` size `fill`; `.button-danger`; `mixins.hero-scrim`.

Icons: field icons keyed by `Field.icon` (README mapping) through `fieldIcon()` in `app/utils/field-icon.util.ts`, `fieldDefault` for unknown keys and custom fields; attachment kind icons; suggested task kind icons; `upcomingEvent` on the event card.

Mocks: `event-recurrence.mock.ts` (#11) infers kind from the Event title and recurrence from "every {n} {unit}" in its description. Field icons (#7), attachment metadata (#12) and the warranty and ownership fields (#6) are delivered; the Thing image (#13) needs no mock.

Stores:

- `ThingsStore.watch` reloads the Issues, Events and attachments collections and the Thing's purchasables when a snapshot brings a new revision.
- Every page write goes through a store method: Thing fields, pins, category, tags and delete (`ThingsStore`); Tag create (`TagsStore`); upload, link, unlink and delete (`AttachmentsStore`); Issue resolve (`IssuesStore`); Event schedule and complete (`EventsStore`); reveal (`ThingsStore.reveal`). No `Api` calls remain on either page or in `bt-field`.

Validation: `CI=true pnpm check`; e2e Thing detail spec (ready layout sections for a sample Thing, Key details from a pin, overflow Change category and Tags, schedule and complete a suggested task, a failed rename reverting with a toast, delete returning Home); the sensitive-field spec moved to All details; integration browser test updated for the new pages and menus; mobile (390px) and desktop screenshots of the ready, processing and discovering states compared with the design frames.

### 6. View all details

One page, `/things/:id/details` (`thing-details.*` in `features/things/`), without the bottom nav. It lists every detail of a Thing in grouped cards. Editing is a backlog feature (#51): the page offers pin, unpin, delete and reveal, and its edit controls render disabled.

Data: `routeThing()` as on the Thing page. A failed first load shows `bt-error-message` with Retry; a missing Thing shows "This thing is unavailable." with a link home; loading shows key/value skeleton rows.

Layout, top to bottom:

- `bt-top-bar` titled "All details", back link to `/things/:id` ("Back to thing"), and a trailing disabled **Edit** icon button ("Edit details (coming soon)") using the `editDetails` icon. The page background is `secondary-subtle`.
- One section per group, each a `bt-section-header` over a `bt-card-group` of `bt-key-value-row`s:
  - **Thing details**: Name, Category, and Description when it has text. Values in `caption`, semibold, `primary-muted`. The row menu holds **Edit** (disabled) only: these values always show on the Thing page and cannot be pinned or deleted.
  - One section per field section from `fieldSections()` (existing grouping), titled with the section name, holding the fields of every set in it. Sections with no fields are skipped.
  - **Other details**: standalone fields, when there are any.
  - **Custom fields**: custom (undefined) fields, when there are any.
- Field rows: label in `label`, `primary-muted`, followed by the `pinField` icon (`sm`, `primary-muted`, labelled "Pinned") when the field is pinned; value in `label`, right-aligned, formatted as on the Thing page's Key details (masked values as dots, missing as "Not recorded" in `primary-muted`, `false` as No, dates as "d MMM y"); a trailing row menu. Each row keeps its field anchor (`fieldAnchor()`, `custom-<id>`) so a linked fragment scrolls to it and highlights it.
- Row menu (`bt-menu`, `moreDetails` vertical-dots icon, `plain` variant, small size, labelled "Actions for {label}"):
  - **Edit**: disabled (#51).
  - **Pin** or **Unpin**: toggles the pin through `ThingsStore.update({ pinnedFields })`.
  - **Reveal** or **Hide**: sensitive fields with a stored value only. Reveal calls `ThingsStore.reveal`; the revealed value replaces the dots until Hide or the Thing's next revision. Revealed values stay in component memory only.
  - **Delete**: removes the stored value after a confirmation dialog ("Delete {label}?", "Its value is removed from this thing.", `.button-danger` **Delete detail**, **Keep it**). Fields in a set and standalone fields send `values: [{ fieldSetId, fieldId, value: null }]`; custom fields send `removeUndefinedFieldIds` and drop their pin.
- While an import runs, Pin, Unpin and Delete are disabled.
- Choosing a row with a shown value (Thing details rows, recorded fields, revealed sensitive fields) copies "Label: value" as displayed and shows "Copied" in place of the value for `copiedMs`. The Thing page's Key details rows copy the same way. In edit mode (#51) rows do not copy.
- On the Thing page, a Key details row whose pinned field has no value has a `warning-subtle` tint and a decorative `editDetails` icon after "Not recorded" (clickable in #53).

The Thing page's overflow item linking here reads **All details**, with the `allDetails` (list) icon.

Components:

- `bt-key-value-row`: projected `[keyValueLabel]` content after the label (the pin icon) and `[keyValueEnd]` content after the value (the row menu); `copyable` makes the row a copy button beneath the end content. Only adjacent rows are divided.
- `bt-icon-button` and `bt-menu`: `size` input, `md` (default, `control-md`) or `sm` (`control-sm`, `sm` icon).

Icons: `pinField` and `pinnedField` become the line and filled pushpin; `unpinField` (unpin), `moreDetails` (vertical dots), `revealValue` and `hideValue` (eye, eye off) added.

Not carried over from the previous editor, all part of #51: name and description editing, value editing, adding and removing sections, adding individual fields and adding custom fields. `bt-field` stays for #51.

Validation: `CI=true pnpm check`; e2e: pinning a detail from its row menu shows it in Key details with the pin icon on All details, a failed pin reverts with a toast, deleting a value after confirmation, sensitive values revealed and hidden from the row menu; integration browser test reads values and pins through the row menus; mobile (390px) and desktop screenshots compared with the View all details frame.

### 7. Chat

- Thing chat and global chat on one component; context card, bubbles, rich text, resource cards, composer.
- Add `marked` and `dompurify`; `bt-rich-text` renders sanitised Markdown.
- Preserve the text-and-request-ID message contract for sends and retries.
- Mocks: saved-document card.
- Move chat onto `ConversationsStore` (`create`, `send`, `watch`, `loadOne`). Resource card actions use `IssuesStore`, `EventsStore` and `AttachmentsStore`. Afterwards only domain services call `Api`; drop the exception from `src/AGENTS.md`.

### 8. Things list and Profile

- Things list with category/tag filter and search; Profile with sign out and sample data.

### 9. Clean-up

- Remove legacy tokens, classes and superseded components.
- Update `README.md`, `src/AGENTS.md`, cheatsheet; browser checks for the new journeys.

## Backend follow-up

`Backend` issues. The frontend mocks each until delivered.

| Issue | Change                                                             | Needed by |
| ----- | ------------------------------------------------------------------ | --------- |
| #6    | Ownership, warranty, support, maintenance and technical field sets | 5, 6      |
| #7    | Icon keys on field definitions                                     | 5         |
| #8    | Category icon keys instead of glyphs                               | 3         |
| #9    | Issue `kind`; open issues ordered by due date                      | 3         |
| #10   | Deadline Issues from warranty-end and renewal dates                | 3         |
| #11   | Recurrence and `kind` on suggested Events                          | 5         |
| #12   | Attachment title, kind, page count and publisher                   | 5         |
| #13   | Product image saved as the Thing image                             | 5         |
| #14   | Chat saves assistant content as a document attachment              | 7         |
| #15   | Chat infers message intent                                         | 7         |

## Future features

Inert in the POC. Track these as `Feature` issues, using area labels according to their repository descriptions. Assign an upcoming deliverable milestone when committed; leave backlog issues without a milestone:

| Issue | Change                                                | Stage |
| ----- | ----------------------------------------------------- | ----- |
| #16   | Sign in with Apple                                    | 2     |
| #17   | Terms and Privacy pages                               | 2     |
| #18   | Issues list (Needs attention **See all**)             | 3     |
| #19   | Timeline page, including Thing task **See all** links | 1, 5  |
| #20   | Compatible products list (**See all**)                | 5     |
| #21   | Chat file attachments                                 | 7     |
| #22   | Chat overflow actions and conversation history        | 7     |
| #51   | Edit mode on All details                              | 6     |

## Re-homed features

Existing behaviour without a slot in the design:

| Feature                                                  | Location                              |
| -------------------------------------------------------- | ------------------------------------- |
| Manual creation                                          | Add Thing, **Enter details manually** |
| Pins, delete values, reveal                              | View all details, row menu            |
| Edit fields, sections, custom fields                     | View all details edit mode (#51)      |
| Add details from a source, change category, tags, delete | Thing overflow menu                   |
| Set as image, unlink, delete                             | Attachment row menu                   |
| Resolve Issue, schedule/complete Event                   | Rows on Home and Thing detail         |
| Sign out, add sample data                                | Profile                               |
