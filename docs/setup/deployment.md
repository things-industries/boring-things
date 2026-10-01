# Render and Supabase deployment

GitHub Actions validates pull requests and pushes to `main`. Render deploys `main` after its checks pass. One Render Free Node service serves Angular and Fastify; Supabase hosts PostgreSQL and a private attachment bucket. The initial deployment uses Supabase Storage through its S3 API. Local development uses filesystem blobs.

## Release sequence

1. CI installs the locked dependencies, builds and runs formatting, spelling, contract, lint, type, unit, integration and browser checks against temporary PostgreSQL databases. It has no production secrets.
2. Render builds the same commit using `render.yaml`.
3. After compilation succeeds, the final build step `pnpm deploy:prepare` applies pending Supabase migrations, upserts registry metadata and creates or verifies the private attachment bucket. The build fails if preparation fails.
4. Render starts the compiled application and checks `/health`, which checks database connectivity.
5. The replacement process waits for the database runner lock. The old process aborts and finishes active work before releasing that lock. Queued jobs can then run on the replacement; interrupted jobs require user retry.

Use the Render workspace's **Wait** overlapping deploy policy. Run production migrations through this release path; coordinate any manual deployment preparation so it cannot overlap. Migration or seed failure stops deployment. Already-applied migrations remain applied when a later step fails.

## Supabase setup

Use a dedicated project with PostgreSQL 17. Inspect its migration history before initial deployment. The application uses the private `bt` schema and Logto identities. Keep `bt` outside exposed Data API schemas.

1. In **Connect**, copy the **Session pooler** connection string on port `5432`. Copy the hostname from the console. The persistent runner lock requires a session connection. Append `?sslmode=verify-full` to enable certificate and hostname verification.
2. In [**Storage → S3**](https://supabase.com/dashboard/project/_/storage/s3), enable the S3 connection and generate an Access Key ID and Secret Access Key. These keys bypass storage row-level security and must remain server-side. Fastify checks ownership before every user download or mutation.
3. Configure the variables below. The deployment script creates the `attachments` bucket through the S3 API and verifies that it is private. Leave public bucket access disabled.

| Variable                                               | Value                                                                                                                |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_PROJECT_REF`                                 | The production project reference                                                                                     |
| `DATABASE_URL`                                         | Production session pooler URL for the app and migrations, including a URL-encoded password and `sslmode=verify-full` |
| `BLOB_STORAGE`                                         | `s3`                                                                                                                 |
| `S3_ENDPOINT`                                          | `https://<project-ref>.storage.supabase.co/storage/v1/s3`                                                            |
| `S3_REGION`                                            | The project's region, such as `eu-west-2`                                                                            |
| `S3_BUCKET`                                            | `attachments`                                                                                                        |
| `S3_ACCESS_KEY_ID`                                     | Server-side S3 access key                                                                                            |
| `S3_SECRET_ACCESS_KEY`                                 | Server-side S3 secret key                                                                                            |
| `LOGTO_ENDPOINT`, `LOGTO_APP_ID`, `LOGTO_API_RESOURCE` | Existing Logto configuration                                                                                         |
| `OPENAI_API_KEY`, `OPENAI_MODEL`                       | Server-side AI configuration                                                                                         |

The Blueprint uses one Free instance in Frankfurt, the nearest available Render region to the initial London Supabase project. Render provides `PORT`; the Blueprint sets `HOST=0.0.0.0` and disables sample data.

Free services sleep after 15 minutes without inbound traffic and take about a minute to wake. They may also restart at any time. Queued jobs remain in PostgreSQL and resume on wake; interrupted imports and chat require user retry. Attachments remain in Supabase Storage. The workspace shares 750 Free instance hours per month across its Free services, including any Travel Things service in the same workspace. Bandwidth and build-minute limits also apply; monitor these in Render billing. See [Free service limits](https://render.com/docs/free).

Configure production values in Render. Keep local `.env` and its `DATABASE_URL` pointing at the local database. The Blueprint's build command handles hosted preparation without a local production configuration file. For optional manual hosted preparation, put the production values in ignored `.env.render` with file permissions restricted to the owner. Do not commit or print that file.

```sh
node --import tsx --env-file=.env.render scripts/deploy.ts --dry-run
node --import tsx --env-file=.env.render scripts/deploy.ts
node --import tsx --env-file=.env.render scripts/smoke-storage.ts
```

The first command verifies the target and migration plan without applying schema, registry or bucket changes. The second changes the hosted database and provisions storage. The third uploads a synthetic object, verifies bytes and anonymous-access denial, then deletes it. `pnpm db:migrate` remains a local command. `supabase/seed.sql` does not contain the registry; the deployment script runs the TypeScript registry seed after migrations.

## Create the Render Blueprint

After the deployment changes are merged and `main` passes CI:

1. In Render, choose **New → Blueprint** and connect `things-industries/boring-things` on `main`.
2. Review the `boring-things` service from `render.yaml` and enter its prompted environment variables from the production configuration above.
3. Create the Blueprint. Confirm the service uses **Free** compute, has **After CI Checks Pass** enabled and the workspace overlapping deploy policy is **Wait**.
4. In GitHub's rules for `main`, require pull requests and the `validate` job from the **CI** workflow. Restrict bypasses as appropriate. Keep the workflow unconditional; Render accepts skipped and neutral checks as passing.
5. Add `https://<service>.onrender.com/callback`, the logout URL `https://<service>.onrender.com/`, and the HTTPS origin to the existing Logto SPA application. Repeat when adding a custom domain. See [Logto setup](logto.md).

A new Blueprint can perform an initial deployment during creation. Prepare all credentials and inspect migration history before creating it.

For an existing Blueprint, sync `render.yaml` after merging changes. Confirm the service shows **Free** compute and an empty **Pre-Deploy Command**; clear any retained pre-deploy command in the service settings. The build command must end with `corepack pnpm deploy:prepare`.

## Verification and recovery

- Verify `/health`, a frontend deep link and the public auth configuration. Confirm private API calls without a bearer token fail.
- Sign in through Logto, create a Thing, upload/download a file and verify a second user cannot access it. Test live sign-out and sign-in.
- Run an import and chat, then redeploy. Verify persisted data and attachments remain; interrupted work offers retry. SSE snapshots refresh during overlap, while token-level deltas are process-local.
- Confirm a failed CI run does not deploy, and failed deployment preparation retains the current release.
- Roll back application code through Render only to a version compatible with the current schema and registry. Rollback does not undo database changes or restore deleted files.

Use additive migrations and compatible registry changes for ordinary releases because the old application can remain online while the build applies migrations. A cancelled or failed deployment can leave completed migrations applied. Schedule maintenance for incompatible changes. Keep at least the previous release compatible until rollback is no longer needed.

The runner uses a dedicated PostgreSQL connection and a session advisory lock. It exits if that session is lost, allowing Render to restart it and recover interrupted work. This supports overlap during deployment; horizontal scaling and distributed streaming require additional design.

Supabase database backups contain Storage metadata, not object bytes. Establish a separate object backup/export and test restoration of the database and matching files before relying on this deployment for irreplaceable attachments. Monitor database connections, storage usage, egress, job failures and `/health`. Proxied downloads also consume Render outbound bandwidth.

References: [Render deploys](https://render.com/docs/deploys), [Blueprint specification](https://render.com/docs/blueprint-spec), [Supabase migrations](https://supabase.com/docs/guides/deployment/database-migrations), [S3 authentication](https://supabase.com/docs/guides/storage/s3/authentication), [database connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [backups](https://supabase.com/docs/guides/platform/backups).
