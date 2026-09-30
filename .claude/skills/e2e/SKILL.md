---
name: e2e
description: Run the Playwright e2e suite, or start the app and screenshot pages in a signed-in headless browser to check a frontend change visually, locally or in a cloud session
allowed-tools: Read, Bash(pnpm *), Bash(./scripts/cloud-postgres.sh)
---

The e2e app runs the built frontend and API against a temporary database seeded with the labelled sample Things, fixture AI providers and a signed test session. No Logto, AI credentials or existing local data are needed, and the app database is not touched.

Input: $ARGUMENTS (routes, specs or a description of what to check)

## 1. Prepare

1. Install dependencies if `node_modules/` is missing: `pnpm install --frozen-lockfile`.
2. Make PostgreSQL available on port 55432:
   - Local machine: `pnpm db:start`.
   - Cloud session (no Docker): `./scripts/cloud-postgres.sh`.
3. Build the frontend after every frontend change: `CI=true pnpm build`. The e2e app serves `dist/web/browser`, not the dev server.

Chromium: Playwright's bundled browser is used when installed, otherwise the preinstalled `/opt/pw-browsers/chromium` in cloud sessions. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` overrides both. Do not run `playwright install` in cloud sessions.

## 2. Run the e2e suite

```bash
pnpm test:e2e                          # all specs at mobile (390x844) and desktop (1440x1100)
pnpm test:e2e --project mobile         # one viewport
pnpm test:e2e -g "Thing page"          # matching tests
```

Playwright starts the app itself on port 4300, or reuses one already started with `pnpm e2e:serve`. Specs live in `e2e/`; import `test` and `expect` from `e2e/fixtures.ts`, which fails a test on page errors, app console errors and 5xx responses. Every test saves a full-page screenshot under `test-results/e2e/results/<test>/`; failures also keep a trace. Tests share one database, so create uniquely named data rather than changing samples other tests read.

Import and chat use fixtures from `server/test/fixtures/`: pasted text `two` returns two Things, `bad` fails extraction, and the chat fixture only creates an event or issue when its `creation` mode is set.

## 3. Screenshot pages

```bash
pnpm e2e:serve                         # run in the background; prints "E2E app ready"
pnpm screenshot                        # /, /things/new and /chat
pnpm screenshot / /things/new          # chosen routes
pnpm screenshot --signed-out /         # sign-in page
pnpm screenshot --viewport mobile --out <scratchpad>/shots /things/new
pnpm screenshot --help
```

Screenshots are written to ignored `test-results/screenshots/<route>-<viewport>.png` unless `--out` is given. The agent cannot see a screenshot until it opens the PNG with the Read tool. Each output line lists the file, page title and final path; lines starting `!` report page errors, app console errors, HTTP 4xx/5xx responses and horizontal overflow, and make the command exit non-zero. Stop `pnpm e2e:serve` when done.

For one-off clicks or form input, write a throwaway `.ts` script under `test-results/` (inside the repo, so it runs as ESM) that calls `launchBrowser()` from `server/test/support/chromium.ts` and opens a context with `storageState: 'test-results/e2e/storage-state.json'`, then run it with `node --import tsx`. Prefer adding a spec to `e2e/` when the flow is worth keeping.

## 4. Report

Check changed pages at mobile and desktop widths. Report what was run or previewed, attach or describe relevant screenshots, and list failures or `!` problems. The e2e app does not replace the live Logto sign-in check.
