# Frontend agent guide

The Angular client manages Things, fields, documents and activity through relative `/api` URLs. Read root `README.md` for implemented behaviour and `docs/requirements/product/PRODUCT.md` for product intent. Read `docs/plans/poc-scaffolding.md` when implementing registry sections, imports or assistant work; the three scaffold steps are implemented, with manual identity/device checks noted in the plan.

## Structure

Paths below are relative to `src/` unless stated otherwise.

- `main.ts`: fetch public runtime configuration and bootstrap the application. Startup failure copy lives in `index.html`.
- `app/app.config.ts`: application-wide providers and initialisation.
- `app/app.routes.ts`: lazy page routes, authentication guards and page titles.
- `app/app.ts`, `.html`, `.scss`: application shell and navigation. Keep feature behaviour out of the shell.
- `app/core/app.config.ts`: application constants such as page sizes and timeouts.
- `app/core/runtime-config.ts`: typed injection token for server-supplied public configuration.
- `app/core/app-icons.ts`: use-case-named icon catalogue.
- `app/core/app-terms.ts`: repeated product/screen names, rendered through `app/pipes/term.pipe.ts`.
- `app/core/mocks/`: labelled stand-ins for missing API capabilities, one file per Backend issue. See its `README.md`.
- `app/core/services/`: application-wide authentication, route guard and API services.
- `app/core/api/thing-stream.ts`: authenticated snapshot transport with reconnect/backoff and cancellation.
- `app/core/api/api-client.ts`: typed `openapi-fetch` client, authentication/error handling and pagination. This is the HTTP path; do not introduce Angular `HttpClient` alongside it.
- `app/features/dashboard/`: Things, filters, sample-data action and activity overview.
- `app/features/things/`: manual creation, details, field edits, pins, tags and attachments; `import-panel.*` handles uploads, confirmation and retry.
- `app/features/chat/`: active conversations, streamed text, retry and typed resource cards. New entry starts a new chat; no conversation history/resumption.
- `app/utils/sections.util.ts`: section grouping and stable field anchors; preserve set identity for edits/pins.
- `app/features/login/`: sign-in and setup-pending screen.
- `app/components/`: reusable field editor, activity cards and error display.
- `app/interfaces/`: exported frontend interfaces and types, grouped by concept.
- `app/validators/`: form validators returning error keys.
- `app/utils/`: pure helpers in concept-named files, including dates and field values. Do not create a catch-all utility file.
- `styles.scss`: global Sass entry point; imports only.
- `styles/`: shared tokens, typography, mixins, base rules and `CHEATSHEET.md`.
- Root `shared/api.ts`: generated OpenAPI types. Root `shared/model.ts`: derived aliases and shared shapes. Import or derive API types instead of duplicating them.

Keep feature-only components and data services beside their feature. Move code into `core/` when it is application-wide and singleton-like. Create shared directives, pipes or stores only when needed.

## Components and state

- Use standalone components, separate `.ts`, `.html` and `.scss` files, and lazy page routes
- Prefer Angular components select the element like `'app-button'` and not by Attribute selector `'[app-button]'`. Only use the attribute selector when the underlying element has to be rendered as a direct descendent or we would be using many of the element's native apis without much structural changes.
- Use `inject()` in field initialisers. Keep the shell focused on navigation and application layout.
- Keep component state in local signals. Shared services own private writable signals and expose readonly views with `asReadonly()`.
- No global store library is currently installed. Introduce a store only when shared state warrants it and the dependency is approved.
- Keep nontrivial data orchestration outside presentation components as features grow.
- Export frontend types from `app/interfaces/`; file-local, unexported types may stay with their consumer. Generated and shared contract types stay in root `shared/`.
- Put constants and settings in `app/core/app.config.ts`. Public backend configuration comes from `/api/config` and the runtime configuration token.

## UI and accessibility

- Design for a phone viewport first, then widen layouts. Validate mobile layouts and keyboard access.
- Use links for navigation and buttons for actions. Preserve native semantics, visible focus, accessible labels and disabled/busy states.
- Show loading skeletons shaped like the content, with a visually hidden status. Keep each skeleton beside its page/component and share dimensions through mixins.
- Render every selected field, including empty editable prompts. Preserve field-set identity when grouping sections or editing pins.
- Keep `false`, `0`, empty text, missing values and masked values distinguishable. Use the generated money shape and supported currencies.
- Sensitive fields start masked. Reveal uses the owner-scoped API; Hide, cancellation and record changes discard revealed state. Never persist revealed values in browser storage.
- Use authenticated blob requests for attachments and images; revoke object URLs when no longer used. Never turn private files into public asset paths.
- Keep sample labels visible and sample merchant actions disabled.

## User-facing copy

- Keep visible text, labels, placeholders, accessible names, validation messages and confirmation copy in templates.
- TypeScript exposes state and error codes; templates choose copy with `@if` or `@switch`. `bt-error-message` renders shared error codes. Do not display raw exception text.
- Validators return error keys, not sentences. API-supplied field names, descriptions and option labels are content and can be bound directly.
- Repeated product/screen names live in `APP_TERMS` and use the `term` pipe. Route titles may read `APP_TERMS` directly.
- Static document title and pre-bootstrap error copy live in `index.html` because Angular may not be running.

## Icons

- Use Remix Icon through `@ng-icons/core` and `@ng-icons/remixicon`, on the 34.x line for Angular 21.
- Import Remix icons only in `app/core/app-icons.ts`. Export names describing their purpose, such as `pinField` and `uploadFile`.
- Components register only their icons in `viewProviders: [provideIcons({ ... })]` and render them with `NgIcon`.
- Prefer line variants; use fills for selected states. Decorative icons use `aria-hidden="true"`; icon-only controls need a label on the control.
- Category icons returned by the registry are API content. UI controls use the icon catalogue.
- Declare custom SVG icons in the catalogue using `currentColor`. Do not add another icon library.

## Styles and dates

- Check `styles/CHEATSHEET.md` before adding styles. Update it when shared roles or mixins change. The cheatsheet should be human readable and offer the array of color options a user can use.
- each color should also have a dedicated css class for text and backgrounds eg .text-danger, .text-primary, .bg-primary etc for easy use in templates. prefer these in templates if no other styles are needed for the element, otherwise use color tokens in the created class.
- Reuse semantic colour, spacing and radius tokens. Keep shared rules in `styles/_core.scss`; put page/component-only rules in its stylesheet.
- Import shared Sass with `@use 'tokens'`, `@use 'typography'` and `@use 'mixins'`; `src/styles` is on the Sass include path.
- Read tokens through `tokens.color(...)`, `tokens.space(...)`, `tokens.radius(...)`, `tokens.shadow(...)`, `tokens.icon-size(...)` and `tokens.size(...)`. Unknown names fail compilation. Give fill roles a matching contrast role and use text roles for text.
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
```

The existing tests use Node's test runner and Playwright under `server/test/`; there is no Angular unit-test builder configured. Update relevant browser checks when a user journey changes. Integration checks require local Supabase and a built frontend, and use isolated databases plus signed test tokens. Verify changed flows at mobile and desktop widths; report live Logto verification separately.
