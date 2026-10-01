---
name: work-fe
description: Work through open Frontend GitHub issues one by one - implement, test, commit, mark ready for QA - then hand back a QA checklist and close or iterate on the results
allowed-tools: Read, Edit, Write, Grep, Glob, Bash(git *), Bash(pnpm *), Bash(env -u GITHUB_TOKEN gh issue *), Bash(env -u GITHUB_TOKEN gh label list*)
---

Work through the open `Frontend` issues on GitHub.

Input: $ARGUMENTS

If the input names issue numbers, work only on those. Otherwise work on every open `Frontend` issue that does not have the `ready for QA` label.

Read [docs/agents/github-issues.md](../../../docs/agents/github-issues.md), [docs/agents/agent-behaviour.md](../../../docs/agents/agent-behaviour.md) and [src/AGENTS.md](../../../src/AGENTS.md) first. The `gh` commands below are for local sessions; run each as `env -u GITHUB_TOKEN gh ...`. In cloud sessions (`CLAUDE_CODE_REMOTE=true`), do the same operations with the GitHub plugin.

## 1. List

Read the repository label descriptions (`gh label list` or the plugin) and use their criteria to identify frontend, backend and operations work. Follow the issue guide for `Feature`, `Bug` and `Task` issue types and milestone assignment. Preserve issue types, milestones and area labels during implementation and QA unless the scope changes.

```bash
env -u GITHUB_TOKEN gh issue list --state open --label Frontend --limit 100 \
  --json number,title,labels --jq '.[] | select(all(.labels[]; .name != "ready for QA")) | "#\(.number) \(.title)"'
```

Show the list and the order you will work in. Put issues that others depend on first. Skip an issue that depends on an open `Backend` issue unless it says the frontend fakes the API, and say why you skipped it.

## 2. Work each issue

For each issue, in order:

1. Read it: `env -u GITHUB_TOKEN gh issue view <n> --comments`.
2. Read the code it touches. If the **Expected** section is ambiguous, the issue asks for a decision, or the change needs a design choice the issue does not make, ask me before writing code. Batch all questions for that issue into one message.
3. Do the work, following `src/AGENTS.md`. Keep the change to what the issue asks.
4. Test:
   - Add or update unit tests for changed behaviour.
   - Run `pnpm check`. Run `pnpm api:generate` first if `openapi.json` changed. Fix failures before moving on.
   - For visible UI changes, check the change in the running app with Playwright at mobile width.
5. Commit only the files for this issue on the current branch. Use the `/commit` message style and add `Refs #<n>` as the last body line. Do not push. Do not use `Closes`; the issue stays open until QA passes.
6. Comment on the issue and add the label:

   ```bash
   env -u GITHUB_TOKEN gh issue comment <n> --body "$(cat <<'EOF'
   Done in <short sha>. Ready for QA.

   ## What changed
   - <one line per behaviour change>

   ## To verify
   - <concrete steps a tester follows>
   EOF
   )"
   env -u GITHUB_TOKEN gh issue edit <n> --add-label "ready for QA"
   ```

7. Check context usage. If more than 150k tokens are in context, stop and ask me whether to continue. Otherwise go to the next issue.

## 3. Hand off

When all issues are done or skipped, reply with a concise QA list, one block per issue:

```text
#<n> <title>
- <step to test> -> <expected result>
```

Then list skipped issues with a one-line reason. Nothing else.

## 4. Act on QA results

I will report back per issue.

- **Passed**: remove the label and close it: `env -u GITHUB_TOKEN gh issue edit <n> --remove-label "ready for QA"` then `env -u GITHUB_TOKEN gh issue close <n> --comment "QA passed."`.
- **Failed or needs changes**: remove the label, fix, test and commit again (`Refs #<n>`), comment with what changed, re-add `ready for QA`, and give me the updated test steps for that issue.
