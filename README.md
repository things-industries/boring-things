# Boring Things

Local Angular/Fastify foundation for managing Things, their fields and documents. Identity comes from Logto Cloud; owned records live in local Supabase Postgres. The database and uploaded files persist across app restarts.

## Start locally

Requires Node 22.12+ (the repository pins 22.14.0), pnpm 10.34.5 and Docker. With fnm installed:

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

Ports are isolated from Supabase's defaults to avoid other local projects. `pnpm db:stop` stops this stack and preserves its data. `pnpm db:migrate` applies pending migrations without resetting data. The Supabase `db reset` command **deletes local database data** and is not needed for ordinary startup.

Run Angular CLI commands with `CI=true` inside the Codex macOS sandbox, including `CI=true pnpm dev` and `CI=true pnpm check`.

## Step 1

- Logto sign-in/sign-out, JWT signature/issuer/audience/expiry validation, local profile creation and owner-scoped access.
- Authored OpenAPI contract, generated TypeScript types and runtime request validation.
- Category and field-set registry; mandatory dependencies, separate set-scoped values, inline edits and empty-field prompts.
- Manual Thing creation/deletion, category correction, pins, tags and custom fields.
- Top-level uploads, downloads, shared links and Thing images. Unlinking retains the file. Referenced files cannot be deleted.
- Issue/Event endpoints, purchasable reads, and conversation/message persistence. No message generation endpoint yet.
- Optional **Add sample data** action. It creates four sample Things with labelled issues, events and purchasables once per owner. Merchant actions are disabled for sample suggestions.

The first AI work will extract and define Things. Import processing, SSE, chat, generated maintenance/product suggestions and hosted deployment are deferred. Activity data currently supports UI exploration.

## Fields and privacy

Registry seeds are authored in `server/src/db/registry-seed.ts`. Edit stable IDs carefully, run the checks, then `pnpm db:seed` and restart the API. Seeding updates registry metadata; it does not migrate existing values or delete owned data. Incompatible registry changes require a migration.

Supported schemas: string (length, pattern, enum, date/date-time), number/integer (bounds), boolean, and a money object with `amountMinor` and `currency` (`GBP`, `EUR`, `USD`, all using two decimal places). Identifiers stay strings. Missing values have no stored entry; responses expand them to `null`. `false`, `0` and empty text are actual values. Clearing a field sends `null`.

Sensitive definitions set `sensitive: true`; `uiHint: password` also requires sensitivity. Custom fields have the same flag. Normal API responses omit sensitive values and source quotes. The Reveal control requests the value through a separate owner-scoped operation; Hide discards it from component state. Request bodies and validation values are not logged. Sensitive data is stored in the local database without field-level encryption; this scaffold is not a password vault.

Removing a populated section or changing category preserves values, provenance and sensitivity as custom fields, and remaps pins. Buildings and contents share the sum-insured definition but store independent values.

## Storage and architecture

- `src/app/`: Angular shell, lazy feature pages, shared components and services; see `src/AGENTS.md`.
- `src/styles/`: Sass tokens, typography, mixins and shared styles; see `src/styles/CHEATSHEET.md`.
- `server/src/application/`: registry validation, field edits and Thing workflows.
- `server/src/db/`: database access and typed registry seeds.
- `server/src/providers/blobs.ts`: storage interface and filesystem implementation.
- `server/src/plugins/auth.ts`: Logto verification and local-user mapping.
- `server/src/contracts/`: runtime schemas drawn from `openapi.json`.
- `shared/api.ts`: generated contract types; do not edit by hand.
- `src/app/core/api/api-client.ts`: `openapi-fetch` client using the generated paths, with bearer authentication and HTTP error handling.
- `supabase/migrations/`: SQL migrations.

Run `pnpm api:generate` after changing `openapi.json`; `pnpm api:check` detects stale types. Angular requests use typed client methods with `params` and `body`, so paths, query parameters, request bodies and responses follow the contract. Binary fields generate as `Blob` for multipart uploads and downloads.

The `bt` schema is not exposed to Supabase browser roles. Fastify is the application access boundary; relationship constraints also prevent cross-owner links. Frontend code contains no database credentials or service keys.

Blobs live under `.data/blobs` by default, with random storage keys and restricted filesystem permissions. Uploads accept PDF, JPEG, PNG, WebP and UTF-8 text up to 20 MiB. File headers are checked against the declared media type. Downloads require bearer authentication and use `Content-Disposition: attachment`. Blob cleanup after metadata deletion can leave an orphan if the filesystem fails; no automatic orphan collector exists yet.

Lists accept `limit` and opaque offset cursors. They reapply owner scope on each page; paging while records change can shift results. Thing edits lock the row and patch specified values. The application is single-process; no queue or SSE runs in step 1.

## Configuration

| Variable             | Purpose                                                     |
| -------------------- | ----------------------------------------------------------- |
| `DATABASE_URL`       | Backend Postgres connection; local default uses port 55432  |
| `LOGTO_ENDPOINT`     | Tenant endpoint, without `/oidc`                            |
| `LOGTO_APP_ID`       | SPA application ID; public identifier                       |
| `LOGTO_API_RESOURCE` | API audience; `https://api.boring-things.local`             |
| `BLOB_DIRECTORY`     | Local blob directory; default `.data/blobs`                 |
| `MAX_UPLOAD_BYTES`   | Upload limit; default 20971520                              |
| `ENABLE_SAMPLE_DATA` | Enables the authenticated sample-data action; default false |
| `HOST`, `PORT`       | API bind address; default `127.0.0.1:3000`                  |

One tenant can supply identities to both local and production environments. Database records and files remain environment-specific. The API returns public auth configuration to the frontend at startup, so Logto settings do not require rebuilding Angular.

## Validation

```sh
pnpm api:generate                # after editing openapi.json
CI=true pnpm check               # contract drift, lint, types, unit tests, build
pnpm test:integration            # requires local Supabase and a built frontend
```

Integration checks create and remove isolated temporary databases; they do not reset the app database. Browser checks use signed test tokens and a local JWKS server, exercising the production verifier. They do not replace the live Logto redirect/login/logout smoke check. Install the matching browser with `pnpm exec playwright install chromium` if needed. Screenshots are saved under ignored `test-results/`.

`pnpm build && pnpm start` serves the built frontend and API from port 3000. Register that origin's callback in Logto if using this mode for login. Production hosting and operating configuration are separate work.
