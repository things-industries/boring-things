---
name: merge-main
description: Pull main and merge it into the current branch, resolving conflicts and aligning backend-driven frontend changes with our frontend patterns
allowed-tools: Read, Edit, Write, Grep, Glob, Bash(git *), Bash(pnpm *)
---

Merge the latest `main` into the current branch.

Input: $ARGUMENTS

Read [docs/agents/agent-behaviour.md](../../../docs/agents/agent-behaviour.md), [src/AGENTS.md](../../../src/AGENTS.md), [docs/plans/poc-frontend.md](../../../docs/plans/poc-frontend.md) and [docs/plans/poc-frontend-progress.md](../../../docs/plans/poc-frontend-progress.md) first. Read [server/AGENTS.md](../../../server/AGENTS.md) if backend files conflict.

## 1. Prepare

1. Stop if the current branch is `main`.
2. Stop and ask if the working tree has uncommitted changes. Do not stash or discard them.
3. Update local `main` without switching branches: `git fetch origin main:main`. If that fails because local `main` has diverged from `origin/main`, stop and tell me.

## 2. Classify the incoming change

```bash
base=$(git merge-base HEAD main)
git log --oneline $base..main
git diff --stat $base..main
```

Group the changed files:

- **Backend**: `server/`, `supabase/`, `openapi.json`, `shared/`, root config and scripts.
- **Frontend**: `src/`.
- **Docs**: `docs/`, `*.md`.

Call the change **backend-led** when most of the non-docs change (by files and lines) is backend. Tell me the classification and the commits it covers before merging.

## 3. Merge

Run `git merge main --no-ff --no-commit`. If it merges cleanly, still do step 4 for the frontend files main changed.

Resolve each conflict by file type:

- `shared/api.ts`: never hand-merge. Resolve `openapi.json` first, then run `pnpm api:generate`.
- `openapi.json`: keep both sides' paths and schemas. If both change the same operation, prefer main's contract and adapt our frontend to it.
- `pnpm-lock.yaml`: take main's version, then run `pnpm install` to reconcile our `package.json`.
- `supabase/migrations/`: keep both sides' files. Never edit a migration main has already added. If two migrations share a timestamp or conflict in intent, stop and ask.
- Other backend files: prefer main's version unless our branch changed the same lines on purpose. Keep both intents where they do not contradict.
- Docs: keep both sides' content. For `docs/plans/poc-frontend-progress.md`, keep our stage statuses and merge the issue and mock tables.
- Frontend files: see step 4.

If a conflict's intent is unclear on either side, ask before resolving it. Batch the questions.

## 4. Frontend changes from a backend-led merge

In a backend-led merge, treat main's frontend edits, conflicting or not, as test harnesses for the new or fixed backend behaviour. They are not designs to keep. For each frontend file main changed:

1. Find the backend feature it exercises: read the matching commits, routes and `openapi.json` changes.
2. Decide whether the file belongs to a screen our branch has rebuilt. Use the stage table in `poc-frontend-progress.md` and the screen routes in `poc-frontend.md`.
3. **Rebuilt or in-progress screen**: resolve to our version, then adapt the feature properly:
   - Consume new or changed API fields through the generated types and existing view-model mapping. Do not add `HttpClient` or duplicate contract types.
   - Place new UI where our design has a slot. If it has none, re-home it following the `Re-homed features` section of `poc-frontend.md`.
   - Follow `src/AGENTS.md`: copy in templates, icons from `app-icons.ts`, tokens and utility classes from `styles/CHEATSHEET.md`, local signals, standalone components.
   - If the backend change resolves an issue that has a mock in `src/app/core/mocks/`, replace the mock with the real API, delete the mock and update the mock and issue tables in `poc-frontend-progress.md`.
   - Drop test-only scaffolding such as debug buttons, raw JSON output and hard-coded IDs.
4. **Screen not yet rebuilt** (legacy code a later stage will replace): do not adapt the feature. Take main's version if it merged cleanly. On conflict, keep whichever side compiles against the merged contract with the smaller change. List these files in the hand-off.

In a frontend-led merge, resolve conflicts by keeping both sides' intent and follow `src/AGENTS.md`. Ask when two designs contradict.

## 5. Validate

1. Run `pnpm install` if `package.json` or `pnpm-lock.yaml` changed.
2. Run `pnpm api:generate` if `openapi.json` changed.
3. Run `pnpm format`, then `CI=true pnpm check`. Fix failures caused by the merge.
4. If main added migrations and local Supabase is running, run `pnpm db:migrate` and `pnpm test:integration`.
5. For adapted visible UI, check it in the running app with Playwright at mobile width.

## 6. Commit

Confirm `git diff --name-only --diff-filter=U` is empty and no conflict markers remain (`git grep -nE '^(<<<<<<<|>>>>>>>)'`). Commit the merge with Git's default merge message, plus short dot points for each frontend adaptation. Do not push.

## 7. Hand off

Reply with:

- Classification and the commit range merged.
- Each conflict and how it was resolved.
- Frontend features adapted, and where they now live.
- Mocks removed.
- Legacy frontend files ignored.
- Validation results, including anything not run.
- Follow-ups: `pnpm install`, `pnpm db:migrate`, or new environment variables needed.
