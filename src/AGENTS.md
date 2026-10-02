# Frontend agent guide

The Angular client manages Things, fields, documents and activity through relative `/api` URLs. Read root `README.md` for implemented behaviour and `docs/requirements/product/PRODUCT.md` for product intent. Read `docs/plans/poc-scaffolding.md` when implementing registry sections, imports or assistant work; the three scaffold steps are implemented, with manual identity/device checks noted in the plan.

## Structure

Paths below are relative to `src/` unless stated otherwise.

- `main.ts`: fetch public runtime configuration and bootstrap the application. Startup failure copy lives in `index.html`.
- `app/app.config.ts`: application-wide providers and initialisation.
- `app/app.routes.ts`: lazy page routes, authentication guards and page titles.
- `app/app.ts`, `.html`, `.scss`: application shell: the centred page column and `bt-bottom-nav` on routes with `data: { bottomNav: true }`. Keep feature behaviour out of the shell.
- `app/core/app.config.ts`: application constants such as page sizes and timeouts.
- `app/core/runtime-config.ts`: typed injection token for server-supplied public configuration.
- `app/core/app-icons.ts`: use-case-named icon catalogue.
- `app/core/app-terms.ts`: repeated product/screen names, rendered through `app/pipes/term.pipe.ts`; toast action leads (`ACTION_TERMS`) and shared error-code copy (`ERROR_TERMS`).
- `app/core/mocks/`: labelled stand-ins for missing API capabilities, one file per Backend issue. See its `README.md`.
- `app/core/services/`: application-wide authentication, route guards (`authenticated`, `addFirstThing`, `importsEnabled`), API client and `Toasts` services.
- `app/core/data/`: stateless domain services, one per API domain (`<domain>.service.ts`). They shape requests, follow pagination, wrap streams and return contract types.
- `app/core/state/`: NgRx Signal Store stores (`<domain>.store.ts`), the `withEntityCollection` feature (optimistic entities, `withLoad`, `loadOne` and `withSession` in one), the lower-level `withOptimisticEntities`, `withLoad` and `withSession` features, the pure optimistic bookkeeping in `optimistic.ts`, `loadCollections()` for pages that load several stores, and cross-entity read models in `views/`. Design: `docs/plans/app-state.md`.
- `app/core/api/thing-stream.ts`: authenticated snapshot transport with reconnect/backoff and cancellation.
- `app/core/api/api-client.ts`: typed `openapi-fetch` client, authentication/error handling and pagination. This is the HTTP path; do not introduce Angular `HttpClient` alongside it. Only domain services call it.
- `app/features/home/`: Home: greeting, Ask promo, Needs attention, Upcoming, Frequent & recent, Categories and the empty-account sample-data action.
- `app/features/dashboard/`: Things list at `/things`: search, category (`?categoryId=`) and tag filters, sample-data action and activity overview.
- `app/features/add-thing/`: Add Thing (`/things/new`) with import tiles, the paste-text step (`/things/new/text`) and the manual form (`/things/new/manual`).
- `app/features/things/`: the Thing page (`thing.*`: hero, sheet, Key details, tasks, products, attachments, overflow menu and dialogs) and All details (`thing-details.*`: grouped detail cards with pin, reveal and delete row menus; editing is #51), sharing `thing-loader.ts` (route Thing, load and stream) and `thing.view.ts` (view helpers). `import-sources.*` adds details from a source; `import-progress.*` and `import-steps.*` show import progress and retry through `ThingsStore`.
- `app/features/chat/`: global and Thing chat on `ConversationsStore`: Thing context card, message bubbles with Markdown answers (`bt-rich-text`), resource cards read from their stores, retry and the composer (`bt-chat-composer`). Each entry starts a new conversation; history and resumption are #22.
- `app/utils/sections.util.ts`: section grouping and stable field anchors; preserve set identity for edits/pins.
- `app/features/login/`: sign-in and setup-pending screen.
- `app/features/timeline/`, `app/features/profile/`: placeholder pages; Profile holds Sign out.
- `app/components/`: reusable components: navigation (`bt-bottom-nav`, `bt-top-bar`, `bt-icon-button`, `bt-menu`), page layout (`bt-scroll-container`, `bt-hero`, `bt-sheet`), `bt-dialog`, `bt-schedule-dialog`, `bt-key-value-row`, `bt-rich-text` (sanitised Markdown), `bt-thing-card`, `bt-status-summary`, `bt-placeholder-page` for destinations not built yet, `bt-notice` banners, `bt-option-tile`, sections and rows (`bt-section-header`, `bt-card-group`, `bt-list-row`, `bt-icon-badge`, `bt-event-card`, `bt-date-tile`, `bt-thing-row`, `bt-thing-thumbnail`, `bt-category-chip`, `bt-promo-card`), field editor, activity cards and error display.
- `app/interfaces/`: exported frontend interfaces and types, grouped by concept.
- `app/validators/`: form validators returning error keys.
- `app/utils/`: pure helpers in concept-named files, including dates and field values. Do not create a catch-all utility file.
- `styles.scss`: global Sass entry point; imports only.
- `styles/`: design system, one file per style scope (`_buttons.scss`, `_forms.scss`, …) or one folder when a scope needs several files (`colors/`, `typography/`), plus `_core.scss`, `_mixins.scss` and `CHEATSHEET.md`.
- Root `shared/api.ts`: generated OpenAPI types. Root `shared/model.ts`: derived aliases and shared shapes. Import or derive API types instead of duplicating them.

Keep feature-only components and data services beside their feature. Move code into `core/` when it is application-wide and singleton-like. Create shared directives, pipes or stores only when needed.

## Components and state

- Use standalone components, separate `.ts`, `.html` and `.scss` files, and lazy page routes
- Prefer Angular components select the element like `'app-button'` and not by Attribute selector `'[app-button]'`. Only use the attribute selector when the underlying element has to be rendered as a direct descendent or we would be using many of the element's native apis without much structural changes.
- Separate declarations with blank lines: after the imports, between top-level declarations, between class methods, between methods in an object literal, between store features and between statement groups in a function body. Consecutive one-line fields, properties and constants may stay together. Prettier keeps blank lines but does not add them.
- Use `inject()` in field initialisers. Keep the shell focused on navigation and application layout.
- Layers: component → store → domain service → API client. Components read store signals and call store methods; they do not call the API client or domain services, except `AttachmentsService.blob()`/`download()` for binary content.
- Product data lives in one store per entity type (`providedIn: 'root'`). Stores keep entities normalised: a child's foreign key (`Issue.thingId`, `Attachment.thingIds`, …) is the source of truth for a relation, and selectors such as `issuesByThing` derive the reverse lists. Selectors ignore references to missing entities.
- Stores depend in one direction: `ThingsStore` injects the child stores it cascades to; child stores never inject `ThingsStore`. Read models that combine stores and serve more than one page live in `core/state/views/`; page-only view mapping stays beside the page.
- Collections load every page once per session (`ensureLoaded()`); pages filter and sort client-side. `load()` reuses a request in flight and `reload()` always fetches. Signing out clears every store and stops its streams.
- Every user change applies optimistically through `withOptimisticEntities`: `stage()` the visible change, then `mutate()` the request. Success confirms the server value; failure reverts only that change and shows a toast. A cross-store change passes every store's staged change to one `mutate()`, so a failure reverts all of them. Server-computed operations (upload, import, reveal, sample data) show an in-progress state instead and report failures in a toast.
- Creates insert after the server responds until the API accepts browser-generated IDs (`core/mocks/client-ids.mock.ts`).
- Component-only UI state (form drafts, open panels, filters) stays in local signals.
- Keep nontrivial data orchestration outside presentation components as features grow.
- Export frontend types from `app/interfaces/`; file-local, unexported types may stay with their consumer. Generated and shared contract types stay in root `shared/`.
- Put constants and settings in `app/core/app.config.ts`. Public backend configuration comes from `/api/config` and the runtime configuration token.

## UI and accessibility

- Design for a phone viewport first, then widen layouts. Validate mobile layouts and keyboard access.
- Pages with a back link or actions use `bt-top-bar` above a `bt-scroll-container` on a host with `mixins.viewport-page`, so the bar stays put and content scrolls below it. Set `--top-bar-background` to match the page. Home and tab pages without a bar scroll the document.
- Use links for navigation and buttons for actions. Preserve native semantics, visible focus, accessible labels and disabled/busy states.
- Show loading skeletons shaped like the content, with a visually hidden status. Keep each skeleton beside its page/component and share dimensions through mixins.
- Render every selected field, including empty editable prompts. Preserve field-set identity when grouping sections or editing pins.
- Keep `false`, `0`, empty text, missing values and masked values distinguishable. Use the generated money shape and supported currencies.
- Sensitive fields start masked. Reveal uses the owner-scoped API; Hide, cancellation and record changes discard revealed state. Never persist revealed values in browser storage.
- Use authenticated blob requests for attachments and images; revoke object URLs when no longer used. Never turn private files into public asset paths.
- Keep sample labels visible and sample merchant actions disabled.

## User-facing copy

- Keep visible text, labels, placeholders, accessible names, validation messages and confirmation copy in templates.
- TypeScript exposes state and error codes; templates choose copy with `@if` or `@switch`. `bt-error-message` renders shared error codes from `ERROR_TERMS`. Do not display raw exception text.
- Mutation failures show a toast through `Toasts.error(action, code)`: the `ACTION_TERMS` lead ("Couldn't save changes") and the `ERROR_TERMS` copy. Stores call `Toasts`, never `ToastrService`. A `401` shows no toast. Page load failures keep the inline `bt-error-message` with Retry.
- Toast styles live in `styles/_toasts.scss`, which replaces the `ngx-toastr` stylesheet.
- Validators return error keys, not sentences. API-supplied field names, descriptions and option labels are content and can be bound directly.
- Repeated product/screen names live in `APP_TERMS` and use the `term` pipe. Route titles may read `APP_TERMS` directly.
- Static document title and pre-bootstrap error copy live in `index.html` because Angular may not be running.

## Icons

- Use Remix Icon through `@ng-icons/core` and `@ng-icons/remixicon`, on the 34.x line for Angular 21.
- Import Remix icons only in `app/core/app-icons.ts`. Export names describing their purpose, such as `pinField` and `uploadFile`.
- Components register only their icons in `viewProviders: [provideIcons({ ... })]` and render them with `NgIcon`.
- Prefer line variants; use fills for selected states. Decorative icons use `aria-hidden="true"`; icon-only controls need a label on the control.
- `Category.icon` is a semantic key; `categoryIcon()` in `app/utils/category.util.ts` maps it to the `categoryIcons` catalogue entries.
- Declare custom SVG icons in the catalogue using `currentColor`. Do not add another icon library.

## Styles and dates

- Check `styles/CHEATSHEET.md` before adding styles. Update it when shared roles or mixins change. The cheatsheet should be human readable and offer the array of color options a user can use.
- each color should also have a dedicated css class for text and backgrounds eg .text-danger, .text-primary, .bg-primary etc for easy use in templates. prefer these in templates if no other styles are needed for the element, otherwise use color tokens in the created class.
- Reuse semantic colour, spacing and radius tokens. Put page/component-only rules in its stylesheet.
- Group shared styles by scope (colours, typography, buttons, icons, forms, …). A scope that fits in one file is `styles/_<scope>.scss`; a scope that needs several files gets a folder, `styles/<scope>/`. Do not add scope rules to an unrelated file.
- Global class names must be specific to their use (`.status-badge`, `.notice-banner`). Modifiers that only apply to one element or class are nested under it (`button { &.quiet {} }`) instead of standing alone as `.quiet` or `.small`.
- `styles/_core.scss` holds page structure and document-wide rules only (`:root` properties, `html`/`body`, box sizing, `[hidden]`, `.visually-hidden`).
- The design system is the app's own. Colours are palette shades named by hue (`green-100`, `neutral-900`) in `colors/_palette.scss`, and colour sets in `colors/_theme.scss`. Each set (`primary`, `accent`, …) has four tokens: `<set>`, `<set>-muted`, `<set>-subtle` and `<set>-contrast`, plus `<set>-contrast-muted` for secondary text on `<set>` where a design needs it (currently `primary`). Colour tokens never name where they are used (no `text-`, `border-`, `surface-` or `background-` tokens); the element picks the token. Do not name tokens after design-tool variables or reference the design tool in styles.
- Import shared Sass with `@use 'tokens'`, `@use 'typography'` and `@use 'mixins'`; `src/styles` is on the Sass include path.
- Read tokens through `tokens.color(...)`, `tokens.space(...)`, `tokens.radius(...)`, `tokens.shadow(...)`, `tokens.icon-size(...)` and `tokens.size(...)`. Unknown names fail compilation. `tokens.color(...)` accepts set tokens and palette shades; prefer set tokens, and use a shade directly when no set token fits.
- Typography roles use `@include typography.role(...)`. Use `typography.tabular-numerals` where figures should align.
- Token, typography and mixin modules emit no CSS on import. Global base styles emit once through `styles.scss`.
- Preserve Boring Things' visual identity when extending the shared style system.
- Use `date-fns` for date parsing, formatting, comparison and arithmetic. Put date helpers in `app/utils/date.util.ts`. Local date/time controls use local time; API instants use UTC.
- Put form validators in `app/validators/<concept>.validator.ts`, exporting functions that return `ValidatorFn` and error keys.

## API and browser state

- Keep backend URLs relative to `/api`. Use generated paths, request and response types, including `Blob` for binary operations.
- After contract changes, edit root `openapi.json` and run `pnpm api:generate`. Do not hand-edit `shared/api.ts`.
- When a contract is missing, resolve it within the authorised task. Any temporary fake must be isolated, labelled and documented; creating an issue requires authorisation.
- Logto owns the identity session. Route guards improve navigation; the server enforces access. Do not add a development sign-in bypass.
- Product data lives on the server. Do not introduce offline caching, a service worker or browser persistence for private records without a requirement.
- Never put database, service-role or AI credentials in client configuration.

## Validation

From the root:

```bash
CI=true pnpm dev:web
CI=true pnpm typecheck
CI=true pnpm check
pnpm test:integration
pnpm test:e2e
```

The existing tests use Node's test runner and Playwright under `server/test/`; there is no Angular unit-test builder configured. Update relevant browser checks when a user journey changes. Integration checks require local Supabase and a built frontend, and use isolated databases plus signed test tokens. Verify changed flows at mobile and desktop widths; report live Logto verification separately.

Cover user journeys in the Playwright e2e suite under `e2e/` (`pnpm test:e2e`). Check visible changes with `pnpm e2e:serve` and `pnpm screenshot`, then read the PNGs. Both run signed in against a temporary database with sample data, locally or in cloud sessions. Setup and options: `.claude/skills/e2e/SKILL.md`.
