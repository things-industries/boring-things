# Backend agent guide

Fastify owns the `/api` boundary, Logto identity verification, owner-scoped data access and private files. It connects to Supabase PostgreSQL with `pg` and can serve the built Angular application.

## Structure and boundaries

Paths are relative to `server/`.

- `src/index.ts`: startup and shutdown; `app.ts`: dependency assembly and Fastify scopes; `config.ts`: eagerly validated `EnvConfig` from an injectable environment source.
- `src/routes/`: typed Fastify route plugins and error translation. Temporary developer/debugging routes may be self-contained, others should use DB/provider/application module abstractions where appropriate.
- `src/http/sse.ts`: bounded SSE transport and connection lifecycle. Routes send readable streams through Fastify. `application/events.ts` supplies the app-owned, typed event bus for data changes and conversation deltas.
- `src/contracts/`: operation types, runtime schema validation, path/reference adaptation and contract checks. Root `openapi.json` generates root `shared/api.ts` for both client and server.
- `src/application/`: workflow rules and transport-independent errors. Imports, conversations and registry have feature folders. Public field selection and bounded web search are shared. `jobs/runner.ts` schedules imports and chat in one process.
- `src/db/`: connection, transaction, row-mapping and error infrastructure. `entities/` groups typed persistence by entity: Issues and Events in `activity.ts`, purchasables in `purchasables.ts`, attachments in `attachments.ts`. `seeds/registry.ts` owns authored registry metadata.
- `src/providers/`: modules for capabilities outside the application boundary, grouped by capability. Encapsulate runtime substitutes and fallback behaviour within each provider, selected through configuration/options. Fake modes require explicit configuration, normally environment settings; failure behaviour is provider-specific. Test-only injection remains available for failure and ownership checks.
- `src/plugins/`: Fastify plugins with typed options, a default `FastifyPluginAsync` export and registration through `fastify.register(plugin, options)`. Choose encapsulation deliberately so hooks and decorators reach their intended routes. Name authenticated child scopes to make their access boundary visible.
- `src/lib/`: purpose-neutral generic helpers.
- `test/`: unit and contract checks; `test/integration/`: isolated database, migration and browser checks.

Use typed functions accepting a database executor, owner ID and named input where applicable. Share a transaction executor across related writes. Keep application workflows responsible for rules; simple CRUD routes can call persistence directly. Publish `data.changed` after successful mutations, using `ownerId` to scope delivery to that user, independently of HTTP response delivery. Subscribe before the initial snapshot and retain periodic refresh for cross-process changes. Keep transport lifecycle outside route modules. Use `dbPool` for the assembled database pool and retain provider names such as `importAi`. Make Fastify schema registration and validator installation explicit in `buildApp`. Add classes for state or lifecycle. Import research uses `ResearchThing` with public `knownFields` and eligible `emptyFields`; `ImportDestination` names the persisted candidate-to-Thing association. Use named declarations for complex function types and small barrels at module boundaries. Server imports use `.js` extensions.

Use namespace imports for database modules throughout the repository, including routes, application workflows, other DB modules, scripts and tests; call functions through names such as `thingsDb` and `importsDb`. Named type imports remain suitable. Prefer readable boundaries and development speed at the current traffic volume; retain transaction support for associated queries. The [attachment extraction and Thing processing plan](../docs/plans/import-improvements.md) defines the planned workflow and reference-attachment lifecycle.

Activities are work the owner manages: suggested tasks, scheduled Events and Issues. Purchasables are opportunities to buy something that maintains or improves a Thing, with dedicated persistence and routes. Shared research patterns use neutral suggestion or research names.

## Authentication and privacy

- Register application routes within the authenticated scope in `buildApp`. Health, public auth configuration and API documentation are intentionally outside it.
- Derive ownership from the verified JWT and local user mapping. Never trust an owner ID supplied by the client or a model.
- Enforce owner scope on every record read/write, relationship, pagination query and attachment download. Validate both ends of a link. Keep cross-owner database constraints.
- Logto verifies signature, issuer, audience and expiry. Do not add a runtime authentication bypass. Signed tokens and a local JWKS server are available in integration tests.
- Preserve `Cache-Control: private, no-store` on authenticated responses.
- Sensitive values and source quotes are omitted from ordinary responses. Reveal is a separate owner-authorised operation. Apply this to custom fields too; a password UI hint requires sensitivity.
- Do not log request bodies, field values, source quotes, bearer tokens or raw database/validation errors. Preserve the existing redaction and sanitised error handler.
- The `bt` schema is not exposed to Supabase browser roles. Masking/reveal does not provide field-level encryption; the POC is not a password vault.

## Registry and field invariants

- Categories own field sets. Field definitions may be reused across sets and categories. Registry IDs are stable authored IDs; custom fields do not create global definitions.
- `includes` are mandatory dependencies; `considerAlongside` are suggestions. Validate references and reject inclusion cycles.
- Each Thing has at most one occurrence of a set. Address values by `(fieldSetId, fieldId)`; standalone fields have no set. Reusing a definition must not merge values across sets.
- Validate against the supported schema subset in the application. Preserve identifiers as strings. Money uses integer `amountMinor` plus currency; the current currencies use two decimal places.
- Missing values have no stored entry; detail responses expand empty fields to `null`. A `null` update removes a stored value. Preserve `false`, `0` and empty strings.
- Patch specified values under a row lock; do not replace a whole document from a stale client snapshot.
- Removing a populated set or changing category preserves values, provenance and sensitivity as custom fields, and remaps pins. Keep source references associated with their values.

## Attachments

- Attachments are top-level owner-scoped resources and can link to multiple Things of the same owner. Unlinking retains the attachment; deletion is rejected while referenced.
- Attachment metadata patches merge under a row lock and refresh every linked Thing. Preserve USER provenance for requests that clear metadata values; source extraction fills missing, unedited metadata; discovered PDF content can replace automated metadata. Page counts are derived from PDF bytes and are read-only.
- A Thing image must be a linked image attachment. Private uploads stay behind authenticated API downloads and the blob adapter; never copy them into `public/`.
- Keep upload size/type limits in configuration. Validate file contents as well as declared media type; sanitise display filenames and use random storage keys.
- Preserve restricted filesystem permissions and download headers. Do not expose storage keys or filesystem paths as public URLs.
- Coordinate database and blob changes with failure cleanup. Blob deletion can currently leave an orphan on filesystem failure; do not imply an orphan collector exists.

## Contracts and persistence

- Author OAS 3.1 endpoints in root `openapi.json`, register through the operation-typed contract helper, then run `pnpm api:generate`. Use semantic tags, operation summaries and schema descriptions; constrain values according to their domain.
- Reuse repeated OpenAPI definitions through components. Order operation keys as `operationId`, `summary`, `description`, `tags`, `parameters`, `requestBody`, `responses`; order schema keys as `type`, `description`, `required`, `properties`, `additionalProperties`, with other keys after these. Describe every operation and component schema in plain language, leading with its purpose and following with relevant edge cases. Describe updates as updating selected properties; explain what null removes and what automatic processing preserves.
- Route modules use typed Fastify plugins with named options. Keep full OpenAPI paths in the contract helper; it selects schemas and infers handler types from those paths. Register private route plugins inside the authenticated scope.
- Prefer `type: ["string", "null"]` and equivalent type arrays for nullable primitive schemas. Use composition for nullable references. Runtime schemas use the tested common AJV 2020/serializer subset.
- Domain enums use UPPER_SNAKE_CASE values in dedicated named schemas at the end of `components.schemas`. Standard JSON Schema/provider values retain their required spelling. Changes to persisted enum values need a data migration and corresponding frontend/provider updates.
- Derive HTTP shapes from `shared/api.ts`; keep database-only and provider-only shapes separate. Route registration infers body, path, query and reply types from method/path. The API error handler translates semantic application errors into HTTP status codes.
- Preserve boundary validation and consistent errors: invalid values/references use 422, conflicts use 409, and single-record operations use 404 for missing or inaccessible records.
- List endpoints return accessible records matching the supplied filters. Missing or inaccessible filter targets produce empty lists. Use `limit` and opaque cursors; reapply owner filters on each page. The current offset cursor can shift when records change.
- Root `supabase/migrations/` is the schema authority. Add migrations; never rewrite an applied migration or add an ORM-owned schema system.
- Use `pnpm db:migrate` to preserve local data. Registry changes go in `src/db/seeds/registry.ts`, then `pnpm db:seed`; restart the API to reload the registry. Incompatible definition changes need value migration.
- Keep sample owned data in the opt-in sample workflow. Seeds must not overwrite user data.
- Production uses Supabase Storage through the S3 blob adapter and a TLS session pooler connection on port 5432. Supabase connections default to required TLS without certificate verification; explicit URL SSL settings override this default. Keep storage keys server-side and use private buckets. See `../docs/setup/deployment.md` for release configuration.

## AI imports and assistant work

- Current fact batches account for every fact through registry mappings, useful custom fields or discard decisions. Commit decisions and Thing updates together; retries reuse selected sets and skip committed batches. Preserve source evidence and owner edits.
- Current import selection and fact mapping use separate provider methods. The processor supplies selected field definitions and batches facts; each mapping batch owns its tool conversation.
- Suggested tasks and purchasables are separate import operations, each with its own prompt, provider method and completion checkpoint. Research from the current mapped Thing’s public fields and reference URLs. Combine web search and structured output in one model request per operation. Keep their orchestration in the import processor and reuse existing provider and persistence helpers.
- Limit each AI task's input to the context, evidence, definitions and tools needed to complete that task. Current mapping callers pass `ExtractedThing` and select the required candidate properties in the prompt.

- Helpers that advance conversation history return the updated history; callers assign it explicitly. Do not mutate supplied history arrays.
- Chat requests contain text and a request ID. The model infers requested actions from user messages and conversation context and asks a follow-up when ambiguous. Enforce owner scope and one creation across Event/Issue tools per message. Commit created records and tool receipts together; retain receipts on retry and reject a changed creation type or Thing. Conversation history is available through `GET /api/conversations`, with optional `thingId` and `minMessageCount` filters; details and streams load by conversation ID. Frontend history integration remains pending.
- Chat answers the question in text, with supporting cards merged by resource or field identity and attachment pages retained. The application supplies tools to the provider, preloads active Thing context and returns rejected arguments or access checks as tool errors. Card selections validate together before adding cards or citations.
- Author task prompts in `src/providers/ai/prompts.ts` and response/tool schemas in `src/providers/ai/schemas.json`; generate schema types with `pnpm ai:generate` and check drift with `pnpm ai:check`. Keep SDK types and provider requests in adapters. Application code owns authorised candidates, validation, persistence and workflow decisions.
- Schema descriptions describe content or behaviour without imperative instructions. Include any `minLength` and `maxLength` limits in the description. Place `description` first in schema objects containing `properties`.
- Treat source documents and model output as untrusted data. Validate returned registry and owned-record IDs, field schemas and owner scope before writes or tool execution.
- Preserve source files, extraction provenance and user-entered values. Omit claims without source evidence; retain citations for discovered facts and suggestions.
- Import research saves applicable category documents, enriches empty eligible fields and selects an official product photo while preserving owner edits. Assistant research answers the user question independently. Share public-field selection and bounded web search. Use `instanceSpecific: false` for research eligibility independently of sensitivity. Category prompts supply document priorities. Keep optional retrieval/model failures recoverable and persistence failures fatal. Workflow, limits, configuration and evaluations are in [the import guide](../docs/setup/imports.md).
- Use Thing Candidate for possible Things identified by an open Import. Current application types remain `ExtractedThing` until migration. The planned [import flow](../docs/plans/import-improvements.md#process-flow) stores transcription, summary and optional source-wide terms on Attachments. Open Imports own candidates, with identifiers and terms specific to each candidate. Thing-context Imports assess relevance and map eligible fields without creating Things. Ambiguous candidates retain a review-required stub until owner resolution is delivered. Discovered resources remain Attachments and join the current Import for targeted processing. Zero-input workflows require Thing context. Retries reuse persisted work while preserving owner edits.
- Implement bounded work, persisted status and interruption recovery before claiming background jobs survive restarts. A dedicated PostgreSQL session lock permits one active runner per database; recovery happens after acquiring it. Release the lock only after work stops. Loss of the lock session exits the process. Deploy overlap uses persisted SSE snapshots; token-level deltas remain process-local.

## Validation

From the root, use `pnpm dev:server`, `pnpm test`, `CI=true pnpm check` and, where relevant, `pnpm test:integration`. Integration checks require local Supabase and a built frontend.

Test changed business invariants and regressions, particularly cross-owner access, sensitive-field omission/reveal, shared attachment lifecycle, independent set values and preservation on category changes. Use the existing Node test harness; add coverage where behaviour warrants it.

## Coding practice and style

- Place a file level comment at the top of all files explaining what that file is for (max 300 chars)
- Put line-comments preceding function declarations to explain the purpose or use case for that function, except when extremely obvious. Max 150 chars. Don't name or count callers or call sites.
- Add line comments to code that merits additional explanation, using concise but readable prose.
- Avoid jargon in comments
- Avoid async iterators, prefer explicitly calling functions in a loop.
- When a change adds code, look for opportunities to remove code too - find anything that is now redundant or repeated.
- If a task requires changes in many files, consider whether abstractions are right, and propose a change if it seems like there's an opportunity to better encapsulate and separate concerns.
