---
description: Create Backend GitHub issues from the recent conversation or from the text that follows
allowed-tools: Read, Grep, Glob, Bash(git *), Bash(env -u GITHUB_TOKEN gh issue list*), Bash(env -u GITHUB_TOKEN gh issue view*), Bash(env -u GITHUB_TOKEN gh issue create*), Bash(env -u GITHUB_TOKEN gh issue comment*), Bash(env -u GITHUB_TOKEN gh label list*)
---

Create one or more `Backend` issues on GitHub.

Input: $ARGUMENTS

If the input is empty, take the issues from the recent conversation: bugs found, follow-ups deferred, or changes agreed but not done. If the input has text, it describes one or more issues; use the conversation only to fill in detail.

Read [docs/agents/github-issues.md](../../docs/agents/github-issues.md) and [server/AGENTS.md](../../server/AGENTS.md) first, and follow the guide for access, labels, title, body and creation.

## Steps

1. List the distinct changes. One issue per change; split anything a developer could not finish on its own.
2. For each change, read the code it touches so every file, component, type and field you name is real.
3. Search open issues for duplicates. Skip or comment on a duplicate instead of creating one.
4. Create each issue with the `Backend` label plus `bug` or `enhancement` (and `accessibility` when it applies).
5. Report each issue as `#<number> <title>` with its URL, and list any you skipped as duplicates.

## Scope

Backend issues cover the Fastify server, `openapi.json` contract, database migrations, prompts and generation under `server/` and `supabase/`.

- If part of a described change belongs to the other area, file that part as a separate `Frontend` issue and link the two.
- If the change is an HTTP contract change, include the proposed route and a `jsonc` request/response example using existing `openapi.json` component names. If the frontend currently fakes it, name the fake file.
- If the input is too vague to write a testable **Expected** section, ask before creating anything.
