# GitHub issues

How agents file issues on `things-industries/boring-things`.

## Access

- **Local sessions:** use the GitHub CLI (`gh`), such as `gh issue list`, `gh issue create`, `gh label list` and `gh api` for milestones. Run it as `env -u GITHUB_TOKEN gh ...` so the signed-in account is used, and pass issue bodies with `--body-file`.
- **Cloud sessions** (`CLAUDE_CODE_REMOTE=true`): use the agent's GitHub plugin. Search deferred tools and inspect the complete connector response, including structured data.

If the session's tool is unavailable or cannot perform the operation, stop that operation and explain the access needed. Do not use a browser, web search or direct HTTP as a fallback unless explicitly directed. Standard git remote commands are unaffected.

General conduct, including task authorisation for creating issues: [`agent-behaviour.md`](agent-behaviour.md#conduct).

## One issue per change

One issue describes one change a developer can pick up and finish on its own. Split anything larger into several issues, and link related ones by number (`Depends on #29`, `Related: #44`).

Before creating, search open issues for the same change. If one exists, report it instead of creating a duplicate, or add a comment when the new information changes it.

## Issue types

Set the GitHub issue type on every issue:

- `Feature`: new or expanded product behaviour.
- `Bug`: behaviour that fails to meet an existing requirement.
- `Task`: maintenance, investigation or other work supporting delivery.

## Milestones

Assign issues to an existing GitHub milestone where relevant. Read milestone titles and descriptions before choosing:

- Use the current or upcoming deliverable's milestone when the issue is required for that deliverable.
- Leave the issue with no milestone assigned if it is a backlog / future thing.

If the intended deliverable is unclear, ask before assigning it.

## Labels

Use existing labels to distinguish frontend, backend and operations work. Read the repository's label descriptions before applying labels; those descriptions define the criteria. Use the configured names and apply each area label whose criteria the issue meets. Do not create labels.

## Title

`<Area of the product>: <the change>`, in sentence case, stated as the outcome. Examples:

- `Things: preserve tags when changing category`
- `Imports: show discovery citations during confirmation`

## Body

Follow [agent-behaviour.md](agent-behaviour.md#writing-documents-prs-issues): describe the change as it is, with no conversation history and no rejected options.

```markdown
## Problem

What the owner or developer sees today, and where. Name files, components, endpoints or types in backticks.

## Expected

- Concrete, testable bullets describing the finished behaviour.

## Notes

- Relevant types, fields, existing code to reuse, constraints. Omit the section if there is nothing to add.
```

Backend issues that define or change an HTTP contract also include the proposed route and a `jsonc` request/response example using existing `openapi.json` component names. When the frontend fakes the missing API, say where and add a `## Frontend` section naming what depends on it.

Ground every file path, type and field in the current code. Read the code before naming it; do not guess.

## Creating

Report each created issue as `#<number> <title>` with its URL.
