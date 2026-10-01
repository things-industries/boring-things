# Boring Things agent guide

Boring Things helps people manage life administration around appliances, memberships, subscriptions, utilities and other Things. The current POC supports authenticated, owner-scoped records, manual editing, private attachments, progressive AI imports, cited discovery and active assistant chat.

## Read when relevant

- `README.md`: implemented behaviour, local setup, configuration and validation.
- `docs/requirements/product/PRODUCT.md`: product intent and user journeys.
- `src/AGENTS.md`: Front end. Angular structure and conventions.
- `server/AGENTS.md`: Back end. Fastify, persistence, authentication and attachments.
- `docs/AGENTS.md`: documentation structure and evidence conventions.

## Agent behaviour

Standard all agent work in this repo must comply with: conduct, documentation maintenance, preference recording, refactoring, comments and document/PR/issue writing. See `docs/agents/agent-behaviour.md`.

## GitHub issues

How agents access, label and write GitHub issues. See `docs/agents/github-issues.md`.

## Architecture and toolchain

```text
Angular browser client -> /api -> Fastify -> Supabase PostgreSQL (bt schema)
                                   |----> Logto identity verification
                                   `----> private filesystem blobs
```

- Angular 21 and plain Fastify 5; strict TypeScript and ESM.
- Node versions follow `package.json`; `.node-version` pins the tested local version. pnpm 10.34.5 via Corepack.
- Development runs Angular and Fastify separately with an `/api` proxy. The production build can serve both from Fastify; hosted deployment is pending.
- PostgreSQL access uses `pg`. SQL migrations are the schema authority. Logto supplies identity; Fastify enforces application access.
- Keep application rules, persistence and external providers separated. Extend existing modules before adding abstractions. Add classes when state or lifecycle requires them.
- Do not introduce frameworks, providers or infrastructure without explicit approval (but suggest them if they would help). Update the relevant guide when a decision changes.
- The browser must not receive database, service-role or AI credentials. Private records and attachments must not enter public assets or shared caches.
- Frontend styling uses Sass, icons use Remix through `ng-icons` 34.x, and date helpers use `date-fns`.
- Tests use Node's test runner; e2e tests use Playwright Test in `e2e/`. ESLint uses flat configuration. Do not assume Angular unit-test targets, GitHub Actions or pre-commit hooks exist.

## API contract

`openapi.json` is authored directly and generates `shared/api.ts`. Never edit generated types manually. `shared/model.ts` contains derived aliases and stored data shapes; avoid duplicating HTTP contracts.

After changing a route, request, response or status code, update OpenAPI and run `pnpm api:generate`. Runtime route schemas come from the same contract. `pnpm api:check` detects stale generated types.

## Development and validation

Follow `README.md` for first setup. Preserve an existing `.env`. Local Supabase uses Postgres port `55432` (`./scripts/cloud-postgres.sh` provides it in cloud sessions without Docker) and Studio at `http://127.0.0.1:55423`; application tables are in `bt`.

```bash
pnpm db:start             # Start this repository's local Supabase stack
pnpm db:migrate           # Apply pending migrations, preserving data
pnpm db:seed              # Update authored registry metadata
CI=true pnpm dev          # Angular and Fastify live reload
pnpm dev:server           # Fastify only
pnpm api:generate        # Generate shared OpenAPI types
pnpm api:check           # Check contract drift
pnpm format              # Apply Prettier formatting
pnpm format:check        # Check formatting without writing
pnpm lint                # ESLint
pnpm test                # Node unit tests
CI=true pnpm typecheck   # Server types and Angular development build
CI=true pnpm check       # Formatting, contract, lint, types, unit tests and build
pnpm test:integration    # Requires local Supabase and built frontend
pnpm test:e2e            # Playwright e2e suite; see .claude/skills/e2e/SKILL.md
pnpm e2e:serve           # Signed-in e2e app on port 4300 with sample data
pnpm screenshot /        # Screenshot pages of the running e2e app
CI=true pnpm build       # Build both targets
pnpm start               # Serve built application
pnpm db:stop             # Stop local Supabase, preserving data
```

- Prefix Angular CLI commands and wrappers with `CI=true` on the first attempt inside Codex's macOS sandbox. If CI mode changes the behaviour under test, request approval for an unsandboxed run.
- Run `pnpm format` after editing, then `CI=true pnpm check` before handing off code changes. Formatting follows `.prettierrc.json` and `.prettierignore`; preserve unrelated working-tree changes. Add relevant integration/browser checks for persistence, authentication or user-journey changes. Documentation-only changes need formatting, path, command and diff checks.
- Integration tests create and remove isolated temporary databases. They do not replace a live Logto redirect/login/logout check.
- Database reset deletes local data. Use it only when deletion is authorised. Ordinary startup and migration do not require a reset.
- Registry seeds update definitions; incompatible changes need a migration for existing values. Sample Things are a separate, opt-in, owner-scoped action.

## Product boundaries

- A Thing has one category, selected field sets, set-scoped values, standalone/custom fields, pins, tags and linked attachments.
- Preserve unknown values, provenance and user edits. Identifiers are strings; absence is distinct from `false`, `0` and empty text.
- Tags currently organise an owner's Things. Household sharing is future work and requires an explicit access model.
- Activity and purchasable samples must stay labelled; sample merchant actions stay disabled.
- Imports and assistant messages share a single-process persisted runner, with authenticated Thing/conversation SSE. Chat infers requested actions from user messages and context; writes require owner-scoped validation and atomic retry receipts, with one creation per message. Do not describe distributed queues, checkout, repair booking, conversation history or hosted deployment as available. Read the scoped plan before extending these boundaries.
