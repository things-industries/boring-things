---
description: Review backend changes for correctness, query cost, data boundary, layering, reuse, API contract, and tests
allowed-tools: Read, Grep, Glob, Edit, Bash(git *), Bash(pnpm lint*), Bash(pnpm typecheck*), Bash(pnpm test*), Bash(pnpm api:generate*)
---

Review the back-end uncommitted changes. If nothing is uncommitted, review the changes in the branch. Report findings only — do not change code unless I ask. The one file you may write to is [docs/refactoring-opportunities.md](../../docs/refactoring-opportunities.md), under the rule below.

## Scope

Target: $ARGUMENTS

If no target is given, review the uncommitted working tree plus any commits on the current branch that are not on `main` (`git diff main...HEAD` and `git status`). If a branch, commit range, PR number, or path is given, review that instead.

Back-end code is everything under [server/](../../server/), plus [openapi.json](../../openapi.json), [supabase/migrations/](../../supabase/migrations/), [supabase/seed.sql](../../supabase/seed.sql) and [shared/](../../shared/). Client changes under [src/](../../src/) belong to `/review-fe`; mention one only where this change breaks it.

Read the full current version of every changed file, not just the diff hunks — reuse and duplication are only visible with the surrounding file in view. Then grep the rest of the repo for the patterns you see in the diff; the helper, database method, or query usually already exists outside the changed files.

Read [server/AGENTS.md](../../server/AGENTS.md) before writing a finding — the layering, ownership, registry and persistence rules below come from it.

## What to look for

### Correctness and data integrity

- Multi-statement writes that need one transaction but run as separate queries, leaving a half-applied state when a later statement fails.
- Read-then-write sequences where two concurrent requests can both pass the same check and both proceed — say what the collision produces.
- Patches or partial updates that replace a whole record from a stale client snapshot instead of writing only the changed fields under a lock.
- Missing values, `null`, `false`, `0` and empty strings conflated anywhere in the write or read path, where the domain model distinguishes them.
- A destructive or structural change (removing a populated section, changing a record's category or type) that drops data instead of preserving it in a compatible shape.
- Sensitive values returned in an ordinary response instead of masked, with reveal/decrypt implemented as anything other than an explicit, separately authorised operation.

### Query cost

Count the database round trips one request actually makes, and say the number in the finding.

- Queries inside a loop or a `map`/`Promise.all` over items where one batched statement would do.
- Sequential awaits with no data dependency between them, where running them concurrently would cut latency.
- The same row fetched more than once in a single request.
- List endpoints not paginated, or a pagination cursor that drops a required scoping filter on later pages.
- Counting or existence checks that fetch full rows instead of using a lightweight query.
- A query whose cost grows with table size and has no supporting index — say what the fix needs to index.
- Config-shaped or rarely-changing data (catalogues, definitions, settings) re-read from the database on every request instead of held in memory and invalidated deliberately.

### Data boundary and exposure

- A route that lets a caller act on another owner's data by supplying a different ID — any record, relationship, or file read or mutated without an ownership check in the query itself, not only in application logic.
- Ownership or identity trusted from a client-supplied value instead of derived from the verified authentication token.
- A schema or migration change that widens access — a table exposed to a role that should not reach it, or a boundary the application enforces bypassed at the database layer.
- Responses carrying fields the client has no use for, or a masked/sensitive field returned unmasked outside its explicit reveal path.
- Secrets read from the environment outside the project's typed config module, or credentials, tokens, or user data reaching a log line, an error message, or client-side configuration.
- Uploaded or private content exposed through a public path, or validated only by its declared type rather than its actual content.

### Layering and reuse

- Business logic in a route/handler file instead of the application layer it belongs in — say which layer the code belongs in.
- Raw queries written outside the project's database layer, or a new database method that duplicates an existing one.
- Provider-specific details (SDK types, prompt construction, storage paths) leaking outside the adapter that owns that provider.
- A pass-through layer that only forwards one call for simple CRUD, and, conversely, business rules or cross-module orchestration sitting where only request handling belongs.
- A generic `Error` thrown where the codebase already has a typed error for that case, or a new error type with no corresponding HTTP status mapping.
- HTTP request/response shapes redeclared by hand instead of derived from the generated contract types.
- Runtime configuration read at the point of use instead of through the project's typed config module.
- A new external system reached directly from application code instead of through an adapter behind the smallest interface its caller needs.
- Drift from the conventions in `server/AGENTS.md`: layering, import style, or a new dependency/framework introduced without approval.

### Background and asynchronous work

- External or AI-generated content trusted without validation before it drives a write, a tool call, or a state transition.
- Provenance, citations, or source references dropped for a fact or suggestion the system did not itself assert.
- A retry or re-run of a background job that duplicates records or overwrites a user's edits instead of resuming from persisted state.
- A long-running or asynchronous job assumed to survive a process restart with no persisted status and recovery path to back that up.
- Failure paths for background work that leave a record stuck in an intermediate state with no way to reach a terminal one.

### API contract and persistence

- A route change with no matching edit to the authored API contract, or generated contract types left stale after a contract change.
- Generated contract files edited by hand instead of regenerated.
- Route-level request/response schemas that do not match what the handler actually returns.
- Validation that accepts more than intended — unbounded input, a missing size/type limit, free text forwarded to an external provider unvalidated.
- A persistence change with no accompanying migration, an already-applied migration edited in place instead of a new one added, or a schema change incompatible with existing data and no migration path for it.
- Seed or sample data changes that could overwrite or leak into real user data.

### Tests

- New behaviour or a fixed bug in this diff with no covering test, especially for invariants the project's agent guide calls out explicitly (ownership, sensitive-field handling, lifecycle rules).
- A unit-testable rule (validation, a pure transformation) tested only through a full route/integration test where a direct test would do.
- Only the happy path covered, with error paths and ownership/authorisation checks untested.
- A persistence or auth-adjacent change with no update to the project's integration test suite, where that surface is already covered by it.

### Comments

Apply the comment rules in [docs/agents/agent-behaviour.md](../../docs/agents/agent-behaviour.md#comments).

## Pre-existing findings

Duplication, layering drift, and consolidation ideas you notice in files this change did not touch do not belong in the review — they are not this diff's problem. Record them in [docs/refactoring-opportunities.md](../../docs/refactoring-opportunities.md) instead: read it first, add each one under the existing heading that already covers it, and only open a new heading when none does. Add the specific file paths, and skip anything the doc already lists. Create the file with a short intro paragraph if it does not exist yet. Then say in one line what you appended.

## Output

Group findings under the seven headings above (do not number them). Skip any heading you found nothing for — six real findings under one heading beats one per heading. Never invent, pad, or downgrade a nit into a finding to give a section something to hold. A review with two findings is a fine review, and so is a review with none. Number every finding, with a single sequence running unbroken across all seven groups — the first finding is 1 and the count keeps climbing into the next group, so no number appears twice in the review.

Each finding takes this shape: a numbered short title, then the location, then the problem, then the fix.

```
### 3. A second confirmation can create two records for one import target
   [imports.ts:41](server/src/routes/imports.ts#L41)
   The route checks the target's confirmation state and inserts the record as two separate awaits, so two taps on Confirm both pass the check and two records get created for one target.
   Fix: move the check and the insert into a single transaction, re-reading the target's latest state inside it and returning the existing record when one is already confirmed.
```

The title is a few words naming the problem — readable on its own, no filename in it. Every finding carries a `Fix:` line with a concrete change, never a restatement of the problem. Where one finding spans several files, list the extra locations on the location line rather than splitting it into separate numbers.

Write the problem in plain prose: what actually goes wrong, in terms of behaviour the owner, the caller, or the data ends up with. Name a symbol only when that symbol is the thing at fault and has to be named to point at it — never as shorthand for a step in a sequence, and never as the whole explanation. A reader who has not opened the file should follow the problem from the sentence alone.

The `Fix:` line can be more specific: it names files, symbols, functions, and columns exactly, because it is an instruction to carry out, but should still describe the solution in brief simple prose.

I reply by number ("do 3 and 7, skip 5"), so a number must identify exactly one finding. Order by impact within each group. State what a finding is, not what it isn't. For every reuse suggestion, name the existing database method, application function, error class, or contract component to use, or the exact new file path to create if none exists. Skip pure formatting nits — Prettier and ESLint own those.

After the last finding, add a short list under the heading `Needs my call`, naming the findings whose fix is not obvious or is mine to decide. Give each one as its number, its title, and a single line stating the choice I have to make. A finding belongs here when its `Fix:` line rests on a judgement rather than a mechanical change — a trade-off between two viable shapes, a data model or API contract choice that is hard to reverse, a decision about what to expose or what to persist, or a change whose blast radius reaches past this diff. Leave the heading out entirely when every fix is clear, and never list a finding whose fix is already concrete and uncontested.

Nothing else follows the findings. No trailing summary, no recap, no closing commentary — only the `Needs my call` list, and the one line naming what you appended to the refactoring doc.
