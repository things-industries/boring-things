---
description: Review local changes, write a commit message, push to a new branch, and open a PR
allowed-tools: Read, Edit, Bash(git *), Bash(pnpm *), Bash(gh pr create*)
---

Do these in order:

1. run `pnpm lint`, `CI=true pnpm typecheck`, and `pnpm exec prettier --write .`. Fix anything they flag.
2. run `pnpm test` (and `pnpm test:integration` if it touches persistence, auth or attachments and local Supabase is running). Fix broken tests.
3. Review my current git diff.
4. Check if i'm on the main branch. If I am, DON'T COMMIT THE CHANGES, create a new branch under fix/ or feat/ depending on the context, and checkout the new branch with the changes. Name the branch appropriate to the main work items and the context of our conversation. if we fixed a bug, mention briefly what experience was fixed. if it's a feature the it should describe the feature.
5. write a clear and descriptive but brief commit message with the appropriate prefix (feat/fix/chore etc.) and context, if the change was complex, add a few dot points below with clear and brief descriptions of what was changed. Then commit to the new branch and push.
6. Open a pull request with a helpful title and description summarizing what changed, why, and noting any errors that were addressed. Make sure to note if there was a migration under `supabase/migrations/` that requires `pnpm db:migrate`, or new packages that need `pnpm install`. Whatever you do, do not commit to MAIN branch. Do not include a by-line saying it was authored by Claude code or anything that isn't relevant for the PR.
7. Do not assume you can continue to commit and push changes without explicit instruction to do so.

DO NOT COMMIT ON THE MAIN BRANCH UNLESS EXPLICITLY TOLD TO.
