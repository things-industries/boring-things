---
description: Create Frontend GitHub issues from the recent conversation or from the text that follows
allowed-tools: Read, Grep, Glob, Bash(git *), Bash(env -u GITHUB_TOKEN gh issue list*), Bash(env -u GITHUB_TOKEN gh issue view*), Bash(env -u GITHUB_TOKEN gh issue create*), Bash(env -u GITHUB_TOKEN gh issue comment*), Bash(env -u GITHUB_TOKEN gh label list*)
---

Create one or more `Frontend` issues on GitHub.

Input: $ARGUMENTS

If the input is empty, take the issues from the recent conversation: bugs found, follow-ups deferred, or changes agreed but not done. If the input has text, it describes one or more issues; use the conversation only to fill in detail.

Read [docs/agents/github-issues.md](../../docs/agents/github-issues.md) and [src/AGENTS.md](../../src/AGENTS.md) first, and follow the guide for access, issue types, milestones, area labels, titles, bodies and creation.

## Steps

1. List the distinct changes. One issue per change; split anything a developer could not finish on its own.
2. For each change, read the code it touches so every file, component, type and field you name is real.
3. Search open issues for duplicates. Skip or comment on a duplicate instead of creating one.
4. Read the repository label descriptions and confirm the change meets the `Frontend` criteria. Set its issue type and applicable area labels following the issue guide. Assign a deliverable milestone where relevant; leave backlog issues without a milestone. Verify the saved fields.
5. Report each issue as `#<number> <title>` with its URL, type, milestone and area labels, and list any you skipped as duplicates.

## Scope

Use the repository’s `Frontend` label description to determine scope. Route operations work according to the operations label description.

- If part of a described change belongs to the backend, such as missing API support, file that part as a separate `Backend` issue and reference it from the `Frontend` issue (`Depends on #N`).
- If the input is too vague to write a testable **Expected** section, ask before creating anything.
