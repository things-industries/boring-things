# Backend agent guide

Fastify owns the `/api` boundary, Logto identity verification, owner-scoped data access and private files. It connects to Supabase PostgreSQL with `pg` and can serve the built Angular application.

## Structure and boundaries

Paths below are relative to `server/` unless stated otherwise.

- `src/index.ts`: process startup, configuration and shutdown.
- `src/app.ts`: `buildApp`, dependency assembly, contracts, authentication, route registration, errors and static frontend serving. Tests can supply database, blob and identity dependencies.
- `src/config.ts`: environment configuration. Add settings here instead of reading environment variables throughout the app.
- `src/plugins/auth.ts`: JWT verification and Logto subject-to-local-owner mapping.
- `src/contracts/routes.ts`: runtime request/response schemas from root `openapi.json`, and route registration.
- `src/routes/`: Things, registry, tags, attachments, activity and conversations.
- `src/application/`: Thing workflows, registry validation, field transformations, pagination, errors and sample data.
- `src/db/connection.ts`: pool, transactions and row mapping; `src/db/things.ts`: Thing persistence; `src/db/registry-seed.ts`: authored definitions.
- `src/application/imports.ts`: persisted runner; `db/imports.ts`: owner-scoped targets, states and confirmation; `application/import-mapping.ts`: validation and edit preservation.
- `src/providers/ai.ts`: OpenAI Responses adapter; `application/discovery.ts`: cited discovery persistence; `routes/imports.ts`: import API and SSE.
- `src/providers/blobs.ts`: `BlobStorage` boundary and local filesystem adapter.
- Root `shared/api.ts`: generated HTTP types; root `shared/model.ts`: aliases and stored Thing shapes.
- `test/*.test.ts`: Node unit tests; `test/integration/`: database and browser integration checks.
- `tsconfig.json` and `tsconfig.build.json`: development/test and production compilation.

Keep HTTP concerns in routes, business rules in application modules, SQL in database adapters and provider details behind interfaces. Some scaffold routes currently contain SQL; move it into capability-specific database modules as those workflows grow. Avoid pass-through service layers for simple CRUD. Server imports use explicit `.js` extensions for Node ESM.

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
- A Thing image must be a linked image attachment. Private uploads stay behind authenticated API downloads and the blob adapter; never copy them into `public/`.
- Keep upload size/type limits in configuration. Validate file contents as well as declared media type; sanitise display filenames and use random storage keys.
- Preserve restricted filesystem permissions and download headers. Do not expose storage keys or filesystem paths as public URLs.
- Coordinate database and blob changes with failure cleanup. Blob deletion can currently leave an orphan on filesystem failure; do not imply an orphan collector exists.

## Contracts and persistence

- Author endpoints in root `openapi.json`, register through the contract helper, then run `pnpm api:generate` at the root. Derive HTTP types from `shared/api.ts`.
- Preserve boundary validation and consistent errors: invalid values/references use 422, conflicts use 409, and missing or inaccessible records use the existing 404 behaviour.
- List endpoints use `limit` and opaque cursors; reapply owner filters on each page. The current offset cursor can shift when records change.
- Root `supabase/migrations/` is the schema authority. Add migrations; never rewrite an applied migration or add an ORM-owned schema system.
- Use `pnpm db:migrate` to preserve local data. Registry changes go in `src/db/registry-seed.ts`, then `pnpm db:seed`; restart the API to reload the registry. Incompatible definition changes need value migration.
- Keep sample owned data in the opt-in sample workflow. Seeds must not overwrite user data.
- Hosted connection, pooling and storage configuration require a deployment decision; do not copy settings from another application.

## AI imports and assistant work

Read root `docs/plans/poc-scaffolding.md` when implementing imports, discovery, streams or assistant execution. Imports, discovery, Thing/conversation SSE and assistant execution are implemented. `application/conversations.ts` owns the bounded tool workflow; `db/conversations.ts` owns message state and transactional write receipts; `providers/chat.ts` adapts streamed Responses calls. The import runner also consumes queued chat messages.

- Enforce message intent before Event/Issue tools. Commit created records and tool receipts together; retain receipts on retry. Conversation history/resumption remains deferred.
- Keep prompts, SDK types and provider requests in adapters. Application code owns authorised candidates, validation, persistence and workflow decisions.
- Treat source documents and model output as untrusted data. Validate returned registry and owned-record IDs, field schemas and owner scope before writes or tool execution.
- Preserve source files, extraction provenance and user-entered values. Keep unsupported claims absent; retain citations for discovered facts and suggestions.
- Several detected Things require user confirmation under the import plan. Retries must reuse persisted work without duplicating Things or overwriting user edits.
- Implement bounded work, persisted status and interruption recovery before claiming background jobs survive restarts. The current server uses one persisted import runner per database and revisioned Thing SSE.

## Validation

From the root, use `pnpm dev:server`, `pnpm test`, `CI=true pnpm check` and, where relevant, `pnpm test:integration`. Integration checks require local Supabase and a built frontend.

Test changed business invariants and regressions, particularly cross-owner access, sensitive-field omission/reveal, shared attachment lifecycle, independent set values and preservation on category changes. Use the existing Node test harness; add coverage where behaviour warrants it.
