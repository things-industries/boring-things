---
name: preview
description: Run the app and screenshot or inspect its pages in a signed-in headless browser, locally or in a cloud session, to check a frontend change visually
allowed-tools: Read, Bash(pnpm *), Bash(./scripts/cloud-postgres.sh), Bash(node --import tsx *)
---

Preview application pages against an isolated temporary database with fixture AI providers and a signed test session. No Logto, AI credentials or existing local data are needed, and the app database is not touched.

Input: $ARGUMENTS (routes or a description of what to check)

## 1. Prepare

1. Install dependencies if `node_modules/` is missing: `pnpm install --frozen-lockfile`.
2. Make PostgreSQL available on port 55432:
   - Local machine: `pnpm db:start`.
   - Cloud session (no Docker): `./scripts/cloud-postgres.sh`.
3. Build the frontend after every frontend change: `CI=true pnpm build`. Previews serve `dist/web/browser`, not the dev server.

Chromium: the harness uses Playwright's bundled browser, falling back to the preinstalled `/opt/pw-browsers/chromium` in cloud sessions. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` overrides both. Do not run `playwright install` in cloud sessions.

## 2. Screenshot

```bash
pnpm preview --samples                      # /, /things/new, /chat and the first sample Thing
pnpm preview --samples / thing:kitchen      # chosen routes; thing:<name> opens a Thing by name prefix
pnpm preview --signed-out /                 # sign-in page
pnpm preview --viewport mobile /things/new  # mobile (390x844), desktop (1440x1100) or both
pnpm preview --help
```

Screenshots are written to ignored `test-results/preview/<route>-<viewport>.png`; open them with the Read tool. Each line lists the file, page title and final path. Lines starting `!` report page errors, console errors, HTTP 4xx/5xx responses and horizontal overflow; any of these makes the command exit non-zero.

`--samples` adds the labelled sample Things (Home insurance, Kitchen hob, Museum membership, Weekend van) with tasks and issues. Without it the account is empty.

## 3. Interact

For flows that need clicks or form input, either:

- Run `pnpm preview --samples --hold` in the background. It prints the app URL and saves a signed-in storage state to `test-results/preview/storage-state.json`. Write a throwaway script under `test-results/` (a `.ts` file inside the repo, so it runs as ESM), launch the browser with `launchBrowser()` from `server/test/support/browser-app.ts`, create a context with `{ storageState }`, then run it with `node --import tsx test-results/<script>.ts`. Stop the held app when done.
- Or call `startBrowserApp({ samples: true })` from `server/test/support/browser-app.ts` directly in the script. It returns `base`, `newContext(signedIn?)`, `pool`, `importAi`, `chatAi`, `authorization` and `close()`. Always call `close()` in `finally`.

Import and chat use fixtures from `server/test/fixtures/`: pasted text `two` returns two Things, `bad` fails extraction, and chat messages need an Action selected.

## 4. Report

Check changed pages at mobile and desktop widths. Report what was previewed, attach or describe relevant screenshots, and list any `!` problems. A preview does not replace the live Logto sign-in check.

For lasting coverage of a user journey, extend `server/test/integration/browser.test.ts` instead of relying on previews.
