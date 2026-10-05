# Boring Things

Local Angular/Fastify foundation for managing Things, their fields and documents. Identity comes from Logto Cloud; owned records live in local Supabase Postgres. The database and uploaded files persist across app restarts.

## Start locally

Requires Node 22.16+ (the repository pins 22.23.3), pnpm 10.34.5 and Docker. With fnm installed:

```sh
fnm use
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm db:start
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Copy `.env.example` only on first setup; preserve an existing `.env`. Complete [Logto setup](docs/setup/logto.md) before signing in. The app can start without Logto configuration and shows a setup-pending page. There is no development authentication bypass.

- App: http://localhost:4200
- API: http://127.0.0.1:3000/api
- Swagger UI: http://localhost:4200/api/documentation
- OpenAPI JSON: http://localhost:4200/api/documentation/json
- Health: http://127.0.0.1:3000/health
- Supabase Studio: http://127.0.0.1:55423 (select the `bt` schema)
- Postgres: `127.0.0.1:55432`

To check on a phone on the same network, run `pnpm dev:lan` instead. It serves the app over HTTPS with a self-signed certificate on every network interface and prints the `Network:` address. Accept the certificate warning on the phone, and register that origin in Logto (see [phone testing](docs/setup/logto.md#phone-testing)).

Ports are isolated from Supabase's defaults to avoid other local projects. `pnpm db:stop` stops this stack and preserves its data. `pnpm db:migrate` applies pending migrations without resetting data. The Supabase `db reset` command **deletes local database data** and is not needed for ordinary startup.

Run Angular CLI commands with `CI=true` inside the Codex macOS sandbox, including `CI=true pnpm dev` and `CI=true pnpm check`.

## Implemented

- Logto sign-in/sign-out, JWT signature/issuer/audience/expiry validation, local profile creation and owner-scoped access.
- Authored OpenAPI contract, generated TypeScript types and runtime request validation.
- List endpoints return accessible records matching all supplied filters. Missing or inaccessible filter targets return empty lists. Invalid filter values return validation errors. Pagination reapplies ownership and filters on every page; offset cursors can shift when records change.
- Category and field-set registry; mandatory dependencies, separate set-scoped values, inline edits and empty-field prompts.
- Manual Thing creation/deletion, category correction, pins, tags and custom fields.
- Top-level uploads, downloads, attachment metadata APIs, shared links and Thing images. Unlinking retains the file. Referenced files cannot be deleted.
- Issue/Event endpoints, purchasable reads, and active multi-message chat with cited resource cards, streamed answers and persisted retry recovery.
- Issue cards support optional freeform `statusText` and date-only `dueDate`, including a local-calendar countdown. Omitted patch fields are preserved; `null` clears them.
- Events can use a date-only `startsOn` or an instant `startsAt`. Scheduling requires one; switching formats requires clearing the other. Event lists order by schedule, then ID, and accept `timeZone` (default UTC) for date-only ordering and inclusive date-range filtering. Date-only events remain upcoming throughout their local day.
- Thing summaries/detail expose `accessCount` and `lastViewedAt`. `POST /api/things/{id}:view` records one page open, without changing edit timestamps or content revision; reads, assistant tools and stream refreshes do not count. Each successful request increments once, so clients must not automatically retry. List sorting supports `UPDATED` (default), `RECENTLY_VIEWED` and `MOST_VIEWED`, before pagination. Unviewed Things sort last for recent views; frequency ties use last-view time, then ID.
- Thing cards use category names and show **New** while creation age is less than seven days. Attention cards use stored Issues; automatic deadline-derived Issue creation and recurring Events remain outside the implemented scope.
- Home and the Things list read client-side stores that load each collection once per session. Resolving an Issue or completing or scheduling an Event there shows immediately; a rejected change reverts and shows an error toast.
- Optional **Add sample data** action. It creates four sample Things with labelled issues, events and purchasables once per owner. Merchant actions are disabled for sample suggestions.

## AI imports

Set `OPENAI_API_KEY` and `OPENAI_MODEL` in `.env`, apply `pnpm db:migrate`, and restart the API. The model must support Responses API image/PDF inputs, structured outputs, function calls and web search. Missing AI configuration disables import controls; manual editing remains available.

The **Add a thing** screen offers Camera, Photos, Files and Text tiles: take or choose a photo, upload a supported file, or paste text on its own step. The manual form is at `/things/new/manual`; Add a thing has no entry to it yet. Without AI configuration the tiles are disabled. The source is stored privately, sent to OpenAI, and linked to an immediate skeleton Thing. An indeterminate progress bar above the Thing shows the current import stage, with reduced-motion support. Multiple detected Things pause for selection (`POST /api/imports/{id}:confirm`); each can create a Thing or add details to an owned record. The client has no selection step. Selected sets appear with empty fields before validated value groups arrive. Facts map to selected-set fields, standalone registry fields or useful custom fields; information without established practical value is discarded. Fact decisions and selected sets are saved as checkpoints so retries process unfinished batches. The original source and extracted content remain stored. Review extracted values.

On an existing Thing, **Add details from a source** starts another import. Uploading under **Attachments** stores and links the file without extracting details (#54). Existing user values are preserved.

- Registry search uses bounded Postgres text/identifier queries, includes mandatory dependencies and one hop of alongside suggestions. The model receives search results, never a whole-registry prompt.
- Mapping accepts retrieved IDs, validates category, field membership and schemas, and preserves user values and clears. Records are read-only during processing. Retries reuse persisted targets and discovery results.
- Naming favours brand and everyday product type, such as **Bosch Oven**. Cited model discovery can refine a new Thing's name. Existing names belonging to the same owner are checked locally; collisions add a model identifier or number. Existing Things and user-edited names are preserved.
- Research uses populated fields classified as `instanceSpecific: false` to find applicable category documents and an official product photograph. Empty eligible fields receive cited `DISCOVERY` values. Owner edits and image choices survive retries. Optional research failures finish with warnings; saved work is reused. See [the import guide](docs/setup/imports.md) for retrieval, document and image limits.
- Authenticated fetch SSE delivers masked snapshots after commits. Navigation/logout aborts the stream; reconnect fetches persisted state with a refreshed token. Streams renew within 55 seconds and use revision ordering.
- One in-process runner consumes persisted jobs. Restart marks interrupted work failed and retryable; queued work resumes. Run one API process per database. This is not a distributed queue.
- Limits: 10 candidates per source, 100 facts per candidate, 1,000,000 characters of extracted text; value groups contain up to 20 facts. Sources remain subject to the configured upload limit. Oversized/invalid extraction fails without deleting the source.
- `GET /api/imports/{id}` reports status, candidates, results, sanitized errors and cumulative model/token/tool/elapsed-time metrics. Full extraction is retained in `bt.imports.extraction`, omitted from ordinary API/SSE responses because it can contain secrets.

## Assistant

Choose **Ask a question** on Home, **Ask** in the bottom navigation or **Ask about this thing** on a Thing. Global chat starts a new conversation on each visit. Thing chat resumes the most recent conversation about that Thing, or starts one when there is none. **New chat** in the chat menu starts a fresh conversation. The active conversation supports follow-up messages. Messages remain stored for recovery and audit, with no conversation browser. Answers render as sanitised Markdown. Resource cards show the referenced Thing, detail, document, task, issue or product with its actions: schedule or complete a task, resolve an issue, download a document.

`GET /api/conversations` lists the owner's conversation summaries, newest message creation time first, with `limit` and `cursor` pagination. Optional `thingId` filters to one Thing; `minMessageCount=1` excludes empty conversations. Counts include persisted user and assistant messages in every status. Titles use the first user message, trimmed and cut to 80 Unicode code points. Empty conversations have a null title and use their creation time for ordering. Details and streams load through the existing conversation-ID endpoints. Frontend history integration remains pending.

- Answers use masked Thing details, linked attachment content and owner-scoped search. Chat may send relevant private documents to OpenAI; document content can contain information beyond the masked field projection. The model is instructed to omit secrets. Source documents and tool results are treated as untrusted evidence.
- The assistant answers questions directly and infers requested maintenance Events or Issues from the conversation, asking for missing details when needed. Each message can create one suggested Event or one open Issue; scheduling and completion use the existing card controls.
- Supporting cards appear once per entity or field, including custom fields. The server combines all cited document pages on one card. Typed cards open Things, show fields, download private documents, schedule/complete Events, resolve Issues and open cited merchant pages. Deleted resources show as unavailable. Sample merchant actions stay disabled.
- The assistant reads existing attachments before researching missing information. Its `research` tool answers the supplied public question using stored fields classified as `instanceSpecific: false`, with the configured search/time budgets. Research returns up to three cited source URLs for short inline links in the answer. Conversation responses represent attachment references as document cards; web source catalogues stay server-side. Research results are reused by Thing and question on message retry. Saving assistant-authored summaries is tracked in [#14](https://github.com/things-industries/boring-things/issues/14).
- The same local runner handles imports and queued messages, with one response in flight per conversation. Completed writes and their retry receipts commit together. Retrying the latest failed response reuses its request ID and completed writes. Queued work resumes on restart; interrupted responses become retryable failures.
- Authenticated conversation SSE sends snapshots plus text deltas identified by message and offset. Reconnect restores the saved conversation and current transient response; disconnecting does not cancel work. Navigation/logout aborts the client stream.
- Per-message limits: 8,000 input characters, 100,000 response characters, 24 resource cards, 12 function calls by default, three attachment reads and one research operation. Chats allow 40 user messages. Related-resource tool results are capped at 30 per kind and report truncation. Usage includes model, input/output/cached tokens, tool calls and elapsed time.

Field sections collapse unbranched inclusion chains under the specialist name. Sibling and shared-dependency sections remain separate. Every field keeps its original set ID for editing, citations and pins. Pinned details appear together above the editor, with sensitive values masked. Purchasables are grouped as consumables, accessories and upgrades.

Sharing, checkout, repair booking, calendar sync and the conversation history UI remain deferred. Render deployment configuration is available; hosted rollout must be verified separately.

## Fields and privacy

The registry contains 165 fieldsets and 413 definitions across seven categories. Ownership, warranty, support and maintenance compose with product or service types. Manufacturer identifiers and coverage components retain separate semantics and set-scoped values. `Other` supports custom fields.

Registry fields carry semantic keys in `icon` (for example `fieldDate`). The table below maps these keys to `@ng-icons/remixicon` exports for frontend integration; clients use `fieldDefault` for missing or unknown keys and custom fields.

| API icon key        | Remix export                |
| ------------------- | --------------------------- |
| `fieldDefault`      | `remixFileListLine`         |
| `fieldPolicy`       | `remixFileListLine`         |
| `fieldManufacturer` | `remixBuildingLine`         |
| `fieldModel`        | `remixHashtag`              |
| `fieldSerial`       | `remixBarcodeLine`          |
| `fieldDate`         | `remixCalendarLine`         |
| `fieldInsurance`    | `remixShieldCheckLine`      |
| `fieldRetailer`     | `remixStore2Line`           |
| `fieldVehicle`      | `remixCarLine`              |
| `fieldSeats`        | `remixGroupLine`            |
| `fieldWeight`       | `remixScalesLine`           |
| `fieldMoney`        | `remixMoneyPoundCircleLine` |
| `fieldMembership`   | `remixTicketLine`           |
| `fieldRenewal`      | `remixRefreshLine`          |
| `fieldLevel`        | `remixVipCrownLine`         |
| `fieldAccessCode`   | `remixLockPasswordLine`     |
| `fieldDimensions`   | `remixRulerLine`            |
| `fieldSupport`      | `remixCustomerService2Line` |
| `fieldPhone`        | `remixPhoneLine`            |
| `fieldLink`         | `remixLinksLine`            |
| `fieldEmail`        | `remixMailLine`             |
| `fieldPerson`       | `remixUserLine`             |
| `fieldAddress`      | `remixMapPinLine`           |
| `fieldService`      | `remixToolsLine`            |
| `fieldPower`        | `remixFlashlightLine`       |
| `fieldBattery`      | `remixBattery2ChargeLine`   |
| `fieldWater`        | `remixWaterFlashLine`       |
| `fieldTemperature`  | `remixTempHotLine`          |
| `fieldNetwork`      | `remixWifiLine`             |
| `fieldStorage`      | `remixHardDrive3Line`       |
| `fieldDisplay`      | `remixComputerLine`         |
| `fieldTime`         | `remixTimeLine`             |
| `fieldSettings`     | `remixSettings3Line`        |
| `fieldDelivery`     | `remixTruckLine`            |
| `fieldPrint`        | `remixPrinterLine`          |
| `fieldSpeed`        | `remixSpeedUpLine`          |
| `fieldFuel`         | `remixGasStationLine`       |
| `fieldAccount`      | `remixAccountCircleLine`    |
| `fieldCount`        | `remixListOrdered2`         |
| `fieldCheck`        | `remixCheckboxCircleLine`   |

Registry seeds are authored in `server/src/db/seeds/registry.ts`. Edit stable IDs carefully, run the checks, then `pnpm db:seed` and restart the API. Seeding updates registry metadata; it does not migrate existing values or delete owned data. Incompatible registry changes require a migration.

Apply `20260930040000_expanded_fieldsets.sql` with `pnpm db:migrate`, then restart the API. The migration installs the catalogue and moves existing appliance ownership/warranty, vehicle registration/VIN and museum membership values into their new sets. It preserves source references, sensitivity, user edits and pins. Conflicts and retired renewal dates become custom fields. Legacy standalone appliance fields migrate to the shared definitions. Re-running `pnpm db:seed` keeps the same catalogue metadata.

Dimensions are separate width, height, depth or length fields where applicable. Measurements and rates use text to retain units, precision and allowance bases; counts, full dates, booleans and simple monetary amounts use typed schemas. Partial manufacture dates remain text. Membership types accept provider-specific names. Upcoming activities belong in events and documents in attachments.

Supported schemas: string (length, pattern, enum, date/date-time), number/integer (bounds), boolean, and a money object with `amountMinor` and `currency` (`GBP`, `EUR`, `USD`, all using two decimal places). Identifiers stay strings. Missing values have no stored entry; responses expand them to `null`. `false`, `0` and empty text are actual values. Clearing a field sends `null`.

Sensitive definitions set `sensitive: true`; `uiHint: password` also requires sensitivity. Custom fields have the same flag. Normal API responses omit sensitive values and source quotes. The Reveal control requests the value through a separate owner-scoped operation; Hide discards it from component state. Request bodies and validation values are not logged. Sensitive data is stored in the local database without field-level encryption; this scaffold is not a password vault.

Removing a populated section or changing category preserves values, provenance and sensitivity as custom fields, and remaps pins. Buildings and contents share the sum-insured definition but store independent values.

## Attachment metadata

Attachment responses include `title`, `documentType`, `publisher`, `documentDate` and read-only `pageCount`. These values are nullable. The current frontend displays filenames; metadata display and editing are available for frontend integration. Downloads retain the original filename and bytes. Metadata edits apply to every Thing linked to the attachment.

`PATCH /api/attachments/{id}` accepts partial updates to `title`, `documentType`, `publisher` and `documentDate`. Omitted values are preserved; `null` clears a value. `metadataSources` records per-property USER, IMPORT or DISCOVERY provenance. User edits, including explicit clears, survive automated extraction and retries. Imports fill missing metadata from the source; discovery saves cited document metadata. Raw extracted quotes stay out of metadata provenance responses.

New PDF uploads and discovery downloads derive `pageCount` with PDF.js in a worker limited to 15 seconds and a 256 MiB old-generation heap. Counts remain unknown for encrypted, malformed or unparsed PDFs and non-PDF files. Parser failure preserves the attachment. Existing files retain filename-based display and unknown metadata until edited or extracted; re-extracting an existing PDF can populate its page count. There is no automatic historical backfill.

## Storage and architecture

- `src/app/`: Angular shell, lazy feature pages, shared components and services; see `src/AGENTS.md`.
- `src/styles/`: Sass tokens, typography, mixins and shared styles; see `src/styles/CHEATSHEET.md`.
- `server/src/application/`: feature workflows for imports, registry and conversations, plus shared activity rules and the single-process job runner.
- `server/src/db/`: connection, transaction, row-mapping and error infrastructure; `entities/` contains typed persistence and `seeds/` contains authored registry seeds.
- `server/src/providers/`: external capabilities grouped into `ai/`, `auth/`, `blobs/` and `web/`; provider factories select runtime adapters from configuration.
- `server/src/plugins/`: typed Fastify plugins for authenticated request handling and optional frontend serving.
- `server/src/contracts/`: operation-specific route types, OAS 3.1 runtime schemas and contract checks.
- `server/src/routes/`: typed Fastify route plugins and error translation; sample SQL stays in `routes/scaffolds/samples.ts`.
- `server/src/http/sse.ts`: bounded SSE streams, periodic snapshots and connection cleanup. Routes subscribe to the app-owned `ApplicationEvents` bus and send streams through Fastify.
- `server/src/lib/`: generic cancellation and media checks.
- `shared/api.ts`: generated contract types; do not edit by hand.
- `src/app/core/api/api-client.ts`: `openapi-fetch` client using the generated paths, with bearer authentication and HTTP error handling.
- `supabase/migrations/`: SQL migrations.

`buildApp` owns the application event bus and SSE lifecycle. `data.changed` signals that data relevant to `ownerId` may have changed and refreshes subscribed snapshots; conversation deltas share the bus and are filtered by owner and conversation. Streams subscribe before reading, refresh every ten seconds for cross-process changes, and close when their buffer fills.

`buildApp` closes database pools it creates; callers close injected `dbPool` instances.

Run `pnpm api:generate` after changing `openapi.json`; `pnpm api:check` detects stale types. Angular requests use typed client methods with `params` and `body`, so paths, query parameters, request bodies and responses follow the contract. Binary fields generate as `Blob` for multipart uploads and downloads.

The `bt` schema is not exposed to Supabase browser roles. Fastify is the application access boundary; relationship constraints also prevent cross-owner links. Frontend code contains no database credentials or service keys. Hosted Supabase connections require TLS by default without certificate verification.

Blobs live under `.data/blobs` by default, with random storage keys and restricted filesystem permissions. Uploads accept PDF, JPEG, PNG, WebP and UTF-8 text up to 100 MB (100,000,000 bytes). File headers are checked against the declared media type. Downloads require bearer authentication and use `Content-Disposition: attachment`. Blob cleanup after metadata deletion can leave an orphan if the filesystem fails; no automatic orphan collector exists yet.

Lists accept `limit` and opaque offset cursors. They reapply owner scope on each page; paging while records change can shift results. Thing edits lock the row and patch specified values. The application and persisted import runner are single-process.

## Configuration

`readConfig(env)` eagerly parses an injectable environment source into `EnvConfig`; production requirements are checked before startup.

| Variable                    | Purpose                                                     |
| --------------------------- | ----------------------------------------------------------- |
| `DATABASE_URL`              | Backend Postgres connection; local default uses port 55432  |
| `LOGTO_ENDPOINT`            | Tenant endpoint, without `/oidc`                            |
| `LOGTO_APP_ID`              | SPA application ID; public identifier                       |
| `LOGTO_API_RESOURCE`        | API audience; `https://api.boring-things.local`             |
| `BLOB_DIRECTORY`            | Local blob directory; default `.data/blobs`                 |
| `MAX_UPLOAD_BYTES`          | Upload and research document limit; default 100000000       |
| `ENABLE_SAMPLE_DATA`        | Enables the authenticated sample-data action; default false |
| `OPENAI_API_KEY`            | Server-only OpenAI credential                               |
| `OPENAI_MODEL`              | Configurable model; required for imports and chat           |
| `DOCUMENT_EXTRACTION_MODEL` | Reference extraction model; defaults to `OPENAI_MODEL`      |
| `IMPORT_TIMEOUT_MS`         | Extraction/mapping attempt deadline; default 180000         |
| `IMPORT_TOOL_ROUNDS`        | Registry tool-call budget per selection or batch; default 4 |
| `DISCOVERY_TIMEOUT_MS`      | Discovery deadline per candidate; default 90000             |
| `DISCOVERY_SEARCH_CALLS`    | Web tool-call budget per import or chat research; default 3 |
| `CHAT_TIMEOUT_MS`           | Assistant attempt deadline; default 180000                  |
| `CHAT_TOOL_CALLS`           | Function-call budget per assistant response; default 12     |
| `AI_MAX_OUTPUT_TOKENS`      | Output token limit per provider response; default 12000     |
| `HOST`, `PORT`              | API bind address; default `127.0.0.1:3000`                  |

One tenant can supply identities to both local and production environments. Database records and files remain environment-specific. The API returns public auth configuration to the frontend at startup, so Logto settings do not require rebuilding Angular.

## Validation

```sh
pnpm api:generate                # after editing openapi.json
pnpm format                      # apply Prettier formatting
pnpm format:check                # check formatting without writing
pnpm spellcheck                  # check spelling across authored text and source
CI=true pnpm check               # formatting, spelling, contract drift, lint, types, unit tests, build
pnpm test:integration            # requires local Supabase and a built frontend
pnpm test:e2e                    # Playwright e2e suite; needs PostgreSQL and a built frontend
```

Spelling uses [CSpell](https://cspell.org/docs/getting-started) and `cspell.json`, accepting British and American English. It checks documentation (including research and meeting notes), agent instructions, OpenAPI, templates, source, tests, SQL and configuration, including dotfiles. Git-ignored files, Git internals, the dependency lockfile, generated API types and PNG references are excluded. Regenerate API types after correcting OpenAPI. CSpell 9 supports the pinned Node version.

Run `pnpm spellcheck` while editing; `CI=true pnpm check` includes it before the code checks. Review unknown words before adding established names or technical terms to the sorted dictionary. Use file-scoped `overrides` for fixture or protocol tokens. Avoid broad exclusions and bulk acceptance of reported words. Editor integrations can use the same configuration. Spelling checks still need proofreading for wrong-word errors and grammar.

Integration checks create and remove isolated temporary databases; they do not reset the app database. Browser checks use signed test tokens and a local JWKS server, exercising the production verifier. They do not replace the live Logto redirect/login/logout smoke check. Install the matching browser with `pnpm exec playwright install chromium` if needed. `/opt/pw-browsers/chromium` is used when present and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` overrides both. Screenshots are saved under ignored `test-results/`.

`pnpm test:e2e` runs the Playwright specs in `e2e/` at mobile and desktop widths against a temporary database with sample data. The e2e skill in `.claude/skills/e2e/SKILL.md` covers the screenshot tool and cloud sessions.

`pnpm build && pnpm start` serves the built frontend and API from port 3000. Register that origin's callback in Logto if using this mode for login. GitHub Actions validates PRs and `main`. The Render Free Blueprint builds the application, prepares production Supabase at the end of the build and deploys after CI passes. Free instances sleep when idle; queued work resumes on wake and interrupted work requires retry. See [deployment setup](docs/setup/deployment.md) for private Supabase Storage, credentials, Logto callbacks, release sequencing and recovery.

### Import verification

`server/test/fixtures/imports.ts` contains synthetic failure/retry fixtures. The hob, van and combined-policy cases also form the SDK extraction replay baseline. Prompts live in `server/src/providers/ai/prompts.ts`; authored response/tool schemas live in `server/src/providers/ai/schemas.json`. Run `pnpm ai:generate` after schema edits; `pnpm ai:check` checks generated types and runs within `pnpm check`. Import and chat adapters use the [official OpenAI TypeScript SDK](https://developers.openai.com/api/docs/libraries), with storage and transport retries disabled. The importer awaits field-set selection and batches of 20 facts, validating and committing each result. `server/test/fixtures/import-recording.json` records extraction/mapping from a live synthetic run with `gpt-5.6-sol`; it is a regression example, not a quality benchmark. Integration/browser checks cover metadata-driven research, category reference extraction, progressive fields, multi-Thing confirmation, owner isolation, shared sources, retry, discovery deduplication, restart recovery and SSE reconnect.

See [the import guide](docs/setup/imports.md) for the lifecycle, research eligibility, provenance and limits. [Import evaluations](docs/requirements/research/import-evaluations.md) record dated measurements and the paid model-comparison command.

Run `node --import tsx --env-file=.env scripts/smoke-import.ts` for a **paid live** check using the configured model and synthetic hob/van/policy data. It creates and removes a temporary local database and blob directory; it does not change application records. Its trace and usage report are saved under ignored `test-results/import-smoke.json`. Live Logto redirects and physical-device camera capture require separate manual checks.

Provider implementation references: [file inputs](https://developers.openai.com/api/docs/guides/file-inputs), [function calling](https://developers.openai.com/api/docs/guides/function-calling), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [web search](https://developers.openai.com/api/docs/guides/tools-web-search).

### Assistant verification and demo

Custom fields use `customFields`, `customFieldId` and `removeCustomFieldIds` in API and stored data. The custom-field migration preserves values, provenance, pins and saved card receipts.

The chat API accepts `{ text, requestId }`. The model selects Event/Issue creation from the user request and conversation, asking a follow-up when ambiguous. One creation per message is enforced transactionally across both tools; retries reuse the saved result. Ownership, input validation, deadlines and read-before-write checks remain application rules. Intent recognition is model judgement.

The application supplies tool definitions and execution to `OpenAiChat.respond`. Active Thing context is already retrieved; prompts include populated masked fields, linked document metadata and activity. Repeated reads reuse earlier tool evidence within the turn. The provider accepts multiple tool calls per AI turn and executes them sequentially, following [OpenAI function-call handling](https://developers.openai.com/api/docs/guides/function-calling). Rejected arguments or inaccessible resources return a tool error for the model to correct or answer around. A rejected card selection saves no partial cards or citations. Provider, persistence, deadline and interruption failures remain retryable message failures; server logs contain failure kind, a sanitised message, conversation ID and message ID.

Text-based PDFs supply extracted text with original page labels, using the import PDF parser. When the answer requires diagrams or visual layout, `read_attachment` can request the original PDF with `includeImages: true`. Images and PDFs without extractable text also supply the source file.

The composer sends text and a request ID, including on retry. The assistant selects actions from the conversation; created Events and Issues appear as resource cards.

`node --import tsx --env-file=.env scripts/smoke-import.ts --assistant` runs the **paid live** synthetic import, cited field answer, maintenance creation/scheduling and restart check. `node --import tsx --env-file=.env scripts/smoke-assistant-products.ts` checks cited answers about compatible products using a synthetic Miele dishwasher record. Both use temporary local databases and remove them afterwards. Reports go to ignored `test-results/assistant-smoke.json` and `test-results/assistant-products-smoke.json`.

`node --import tsx --env-file=.env scripts/smoke-chat-actions.ts` runs nine **paid live** model checks with synthetic conversations and simulated tools: questions, troubleshooting, Event/Issue requests, ambiguity, contextual confirmation, negation, document instructions and completed actions. It accesses no application records. Results and usage are saved to ignored `test-results/chat-actions-smoke.json`; the command exits unsuccessfully if any scenario fails. All nine scenarios passed locally on 30 September with `gpt-5.6-sol`. This bounded smoke check does not establish general intent-recognition reliability.

Validated locally on 29 September with `gpt-5.6-sol`: three-Thing import; Z-number `0015` cited from the field/source; chat-created Event scheduled and retained after API restart; three cited merchant links for the Miele product check. These are smoke results, not a quality benchmark. The hob import produced no supported products. Discovery depends on available sources and may return none.

Demo after applying migrations and configuring Logto/OpenAI:

1. Sign in, select **Add a thing**, then upload a source or paste text. Confirm candidates if prompted.
2. Watch fields populate; inspect documents, grouped sections and pins.
3. Select **Ask about this thing** and ask for a saved detail or manual instruction. Open the cited field/document card.
4. Describe the maintenance task to create, send, and schedule its card using local date/time.
5. Ask for compatible consumables/accessories/upgrades. Open a supported merchant link when one is found.
6. Return to the Thing and reload. The scheduled Event, imported fields and cited conversation remain.

Integration checks cover shared attachments, user-edit preservation, grouping, duplicate-free writes and question-based research retry, owner isolation, deadlines, stream reconnect and restart recovery. Browser checks exercise signed JWT authentication, mobile/desktop chat cards and scheduling. Live Logto redirect/login/logout and physical-device camera capture remain manual; they have not been repeated for step 3.

API domain enums use UPPER_SNAKE_CASE. Run `pnpm db:migrate` before starting this version against an existing database: the migrations update domain enums and remove stored message intent, preserving user values, message content and retry receipts. Frontend and backend must be updated together. JSON Schema type/format names and external provider protocol values keep their standard spelling.
