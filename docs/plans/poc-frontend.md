# POC frontend

Rebuild the Angular client against the [Boring Things POC Figma file](https://www.figma.com/design/SV6xV538vbD2Vn5f1EF1rR/Boring-Things-POC?node-id=0-1). Scope follows the POC screens in [Milestones](../requirements/roadmap/MILESTONES.md). Progress is tracked in [`poc-frontend-progress.md`](poc-frontend-progress.md).

Inputs: [scaffolding plan](poc-scaffolding.md), [frontend guide](../../src/AGENTS.md), [issue conventions](../agents/github-issues.md), `openapi.json`.

Issues created during a stage go in the `POC` milestone when the POC needs them, such as Backend changes a stage mocks. Enhancements left inert in the POC get no milestone.

## Principles

- **Tokens first.** Every colour, font size, weight, line height, spacing, radius, shadow and icon size comes from `src/styles/` tokens. No literal values in component styles.
- **Components on first encounter.** When a pattern first appears, build it as a shared component or mixin in that stage and record it in the component inventory below. Later stages reuse it; they do not restyle a copy.
- **Align, do not copy.** Figma values are snapped to the token scale. Deviations are listed under [Design alignment](#design-alignment) and resolved once in stage 0.
- **Mock behind a seam.** When the design needs data or behaviour the API lacks, the frontend maps API responses to view models and fills gaps from a labelled mock in `src/app/core/mocks/`. Each mock names its Backend issue. Removing the mock is part of closing that issue.
- **Unprovisioned features are inert.** Controls for features outside the POC render as designed, are disabled or open a placeholder page, and have an `enhancement` issue.
- **Existing behaviour is preserved** and re-homed where the design has no slot: import progress, multi-Thing confirmation, sensitive reveal, pins, tags, custom fields, section add/remove, category correction, attachment link/unlink/extract/set image, event scheduling/completion, issue resolution, chat retry, sample labels. See [Re-homed features](#re-homed-features).
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
- Apple sign-in and Terms/Privacy pages are inert (enhancement).

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
- **Processing**: hero image, resting sheet with category, name and model subtitle; **Finding useful details** notice with spinner ("You can leave this screen"); sections render labels with skeleton values; populated rows replace skeletons as snapshots arrive. Multi-Thing confirmation replaces the notice when candidates need selection.
- **Ready**:
  - Hero: Thing image (or category artwork) with top scrim, back and overflow buttons.
  - Resting sheet overlapping the hero: category, name, model subtitle (`common.model`), **Ask** pill opening Thing chat.
  - Status summary: Warranty, Age, Manual tiles, derived from warranty-end and purchase-date fields and a manual attachment.
  - **Key details**: pinned fields as icon/label/value rows. **Copy** copies the rows as text to the clipboard. **See all** opens View all details.
  - **Upcoming tasks**: next scheduled Event card. **See all** inert.
  - **Suggested tasks**: suggested Events with icon badge, title, recurrence; **+** schedules via a date picker (existing schedule behaviour). **See all** inert.
  - **Compatible products**: purchasables with icon badge, name, description and a **Buy** button that opens the merchant URL in a new tab. Sample purchasables show a disabled **Buy**. **See all** inert.
  - **Attachments**: icon by document kind, title, meta line (type · pages · publisher or date), download. **Add** uploads and links a file.
  - Overflow menu: Edit details, Add details from a source, Change category, Tags, Delete.
  - Attachment row menu: Set as image, Extract details, Unlink, Delete.

### View all details

- Top bar: back, "All details", edit button.
- One grouped card per field section (existing section grouping), key/value rows, empty values shown as prompts.
- Edit mode reuses `bt-field` editors inside the same cards; sensitive fields keep Reveal/Hide.

### Chat (Thing and global)

- Top bar: back, title, overflow (inert).
- Thing chat starts with a Thing context card. Global chat shows Thing cards inline when referenced.
- User bubbles with time; assistant text rendered as formatted text (headings, lists, emphasis).
- Resource cards restyled: Thing card, field key/value card, saved-document card, Event/Issue/purchasable rows reuse list-row components.
- Composer: pill input with contextual placeholder, attach button (inert), primary send button. Messages send text and a request ID; the backend infers requested actions from the conversation. Streaming, retry and failure states restyled.

### Things list, Timeline, Profile

- Things list: search and category filter, Thing rows. Composed from Home components.
- Timeline: placeholder page (enhancement).
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
| `bt-status-summary`   | Row of tinted metric tiles                                          | 5     |
| `bt-menu`             | Overflow action menu                                                | 5     |
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

- Rebuild login and setup-pending screens; `bt-notice` for setup state.

### 3. Home

- Greeting, promo card, Needs attention, Upcoming, Frequent & recent, Categories.
- Build the list, card, thumbnail and chip components listed for stage 3.
- Loading skeletons and empty states.
- Mocks: issue kind, category icon keys.

### 4. Add Thing

- Option tiles, file inputs, paste-text step, privacy notice.
- **Enter details manually** link to the existing manual creation form.

### 5. Thing detail

- Hero, sheet, status summary, Key details, tasks, products, attachments, overflow menu.
- Discovering and processing states with skeletons; multi-Thing confirmation restyled.
- Mocks: field icons, event recurrence and kind, attachment title/kind/pages/publisher, product image, warranty/ownership fields.

### 6. View all details

- Grouped section cards, edit mode with `bt-field`, sections/custom fields management.

### 7. Chat

- Thing chat and global chat on one component; context card, bubbles, rich text, resource cards, composer.
- Add `marked` and `dompurify`; `bt-rich-text` renders sanitised Markdown.
- Preserve the text-and-request-ID message contract for sends and retries.
- Mocks: saved-document card.

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

## Enhancements

Inert in the POC. `Frontend` `enhancement` issues:

| Issue | Change                                                | Stage |
| ----- | ----------------------------------------------------- | ----- |
| #16   | Sign in with Apple                                    | 2     |
| #17   | Terms and Privacy pages                               | 2     |
| #18   | Issues list (Needs attention **See all**)             | 3     |
| #19   | Timeline page, including Thing task **See all** links | 1, 5  |
| #20   | Compatible products list (**See all**)                | 5     |
| #21   | Chat file attachments                                 | 7     |
| #22   | Chat overflow actions and conversation history        | 7     |

## Re-homed features

Existing behaviour without a slot in the design:

| Feature                                                  | Location                                        |
| -------------------------------------------------------- | ----------------------------------------------- |
| Manual creation                                          | Add Thing, **Enter details manually**           |
| Edit fields, pins, sections, custom fields, reveal       | View all details, edit mode                     |
| Add details from a source, change category, tags, delete | Thing overflow menu                             |
| Set as image, extract details, unlink, delete            | Attachment row menu                             |
| Multi-Thing confirmation                                 | Thing detail, in place of the processing notice |
| Resolve Issue, schedule/complete Event                   | Rows on Home and Thing detail                   |
| Sign out, add sample data                                | Profile                                         |
