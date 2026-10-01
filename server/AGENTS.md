# Backend agent guide

Fastify owns the `/api` boundary, Logto identity verification, owner-scoped data access and private files. It connects to Supabase PostgreSQL with `pg` and can serve the built Angular application.

## Structure and boundaries

Paths are relative to `server/`.

- `src/index.ts`: startup and shutdown; `app.ts`: dependency assembly and Fastify scopes; `config.ts`: environment settings.
- `src/routes/`: typed Fastify route plugins, error translation and SSE transport. Temporary developer/debugging routes may be self-contained, others should use DB/provider/application module abstractions where appropriate.
- `src/contracts/`: operation types, runtime schema validation, path/reference adaptation and contract checks. Root `openapi.json` generates root `shared/api.ts` for both client and server.
- `src/application/`: workflow rules and transport-independent errors. Imports, conversations and registry have feature folders; discovery is shared. `jobs/runner.ts` schedules imports and chat in one process.
- `src/db/`: connection, transaction, row-mapping and error infrastructure. `entities/` groups typed persistence by entity or semantic concept; `seeds/registry.ts` owns authored registry metadata.
- `src/providers/`: modules for capabilities outside the application boundary, grouped by capability. Encapsulate runtime substitutes and fallback behaviour within each provider, selected through configuration/options. Fake modes require explicit configuration, normally environment settings; failure behaviour is provider-specific. Test-only injection remains available for failure and ownership checks.
- `src/plugins/`: Fastify plugins with typed options, a default `FastifyPluginAsync` export and registration through `fastify.register(plugin, options)`. Choose encapsulation deliberately so hooks and decorators reach their intended routes.
- `src/lib/`: purpose-neutral generic helpers.
- `test/`: unit and contract checks; `test/integration/`: isolated database, migration and browser checks.

Use typed functions accepting a database executor, owner ID and named input where applicable. Share a transaction executor across related writes. Keep application workflows responsible for rules; simple CRUD routes can call persistence directly. Publish owner notifications after successful mutations, independently of HTTP response delivery. Add classes for state or lifecycle. Use named declarations for complex function types and small barrels at module boundaries. Server imports use `.js` extensions.

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
- Missing values have no stored entry; detail responses expand empty fields to `null`. `null` clears a value. Preserve `false`, `0` and empty strings.
- Patch specified values under a row lock; do not replace a whole document from a stale client snapshot.
- Removing a populated set or changing category preserves values, provenance and sensitivity as custom fields, and remaps pins. Keep source references associated with their values.

## Attachments

- Attachments are top-level owner-scoped resources and can link to multiple Things of the same owner. Unlinking retains the attachment; deletion is rejected while referenced.
- Attachment metadata patches merge under a row lock and refresh every linked Thing. Preserve USER provenance for explicit clears; automated extraction only fills missing, unedited metadata. Page counts are derived from PDF bytes and are read-only.
- A Thing image must be a linked image attachment. Private uploads stay behind authenticated API downloads and the blob adapter; never copy them into `public/`.
- Keep upload size/type limits in configuration. Validate file contents as well as declared media type; sanitise display filenames and use random storage keys.
- Preserve restricted filesystem permissions and download headers. Do not expose storage keys or filesystem paths as public URLs.
- Coordinate database and blob changes with failure cleanup. Blob deletion can currently leave an orphan on filesystem failure; do not imply an orphan collector exists.

## Contracts and persistence

- Author OAS 3.1 endpoints in root `openapi.json`, register through the operation-typed contract helper, then run `pnpm api:generate`. Use semantic tags, operation summaries and schema descriptions; constrain values according to their domain.
- Route modules use typed Fastify plugins with named options. Keep full OpenAPI paths in the contract helper; it selects schemas and infers handler types from those paths. Register private route plugins inside the authenticated scope.
- Prefer `type: ["string", "null"]` and equivalent type arrays for nullable primitive schemas. Use composition for nullable references. Runtime schemas use the tested common AJV 2020/serializer subset.
- Domain enums use UPPER_SNAKE_CASE values in dedicated named schemas at the end of `components.schemas`. Standard JSON Schema/provider values retain their required spelling. Changes to persisted enum values need a data migration and corresponding frontend/provider updates.
- Derive HTTP shapes from `shared/api.ts`; keep database-only and provider-only shapes separate. Route registration infers body, path, query and reply types from method/path. The API error handler translates semantic application errors into HTTP status codes.
- Preserve boundary validation and consistent errors: invalid values/references use 422, conflicts use 409, and missing or inaccessible records use the existing 404 behaviour.
- List endpoints use `limit` and opaque cursors; reapply owner filters on each page. The current offset cursor can shift when records change.
- Root `supabase/migrations/` is the schema authority. Add migrations; never rewrite an applied migration or add an ORM-owned schema system.
- Use `pnpm db:migrate` to preserve local data. Registry changes go in `src/db/seeds/registry.ts`, then `pnpm db:seed`; restart the API to reload the registry. Incompatible definition changes need value migration.
- Keep sample owned data in the opt-in sample workflow. Seeds must not overwrite user data.
- Hosted connection, pooling and storage configuration require a deployment decision; do not copy settings from another application.

## AI imports and assistant work

- Chat requests contain text and a request ID. The model infers requested actions from user messages and conversation context and asks a follow-up when ambiguous. Enforce owner scope and one creation across Event/Issue tools per message. Commit created records and tool receipts together; retain receipts on retry and reject a changed creation type or Thing. Conversation history/resumption remains deferred.
- Keep prompts, SDK types and provider requests in adapters. Application code owns authorised candidates, validation, persistence and workflow decisions.
- Treat source documents and model output as untrusted data. Validate returned registry and owned-record IDs, field schemas and owner scope before writes or tool execution.
- Preserve source files, extraction provenance and user-entered values. Keep unsupported claims absent; retain citations for discovered facts and suggestions.
- Several detected Things require user confirmation under the import plan. Retries must reuse persisted work without duplicating Things or overwriting user edits.
- Implement bounded work, persisted status and interruption recovery before claiming background jobs survive restarts. The current server uses one persisted job runner per database and revisioned Thing SSE.

## Validation

From the root, use `pnpm dev:server`, `pnpm test`, `CI=true pnpm check` and, where relevant, `pnpm test:integration`. Integration checks require local Supabase and a built frontend.

Test changed business invariants and regressions, particularly cross-owner access, sensitive-field omission/reveal, shared attachment lifecycle, independent set values and preservation on category changes. Use the existing Node test harness; add coverage where behaviour warrants it.
