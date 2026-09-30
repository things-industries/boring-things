---
description: Review an implementation plan for scope, fit with its master plan, grounding in the code, sequencing, and follow-through
allowed-tools: Read, Grep, Glob, Bash(git *), Bash(ls *), Bash(find *)
---

Review an implementation plan document. Report findings only — do not change the plan or any code unless I ask.

## Scope

Target: $ARGUMENTS

If no target is given, review the plan documents changed in the uncommitted working tree plus any commits on the current branch that are not on `main` (`git diff main...HEAD` and `git status`). If that turns up no plan document, ask which plan to review rather than guessing.

Plans live under [docs/plans/](../../docs/plans/). [docs/plans/poc-scaffolding.md](../../docs/plans/poc-scaffolding.md) is the current master plan for the POC's registry, import and assistant work; other plans apply only to their named area.

## What to read first

These are instructions to you, the reviewer. Do all of it before writing a single finding.

Read the whole plan, not just the changed lines — a plan is only coherent as a whole, and a new section usually contradicts one further down. Then read around it:

- **Sibling plans** in `docs/plans/`, if any cover adjacent or preceding work.
- **The code the plan describes.** Open the files, modules, routes, and components it names. Grep for the helper, endpoint, or component it proposes to build — it is often already there. Cross-check against [server/AGENTS.md](../../server/AGENTS.md) and [src/AGENTS.md](../../src/AGENTS.md) for what already exists and what conventions apply.
- **Root [AGENTS.md](../../AGENTS.md)** and [docs/requirements/product/PRODUCT.md](../../docs/requirements/product/PRODUCT.md) for current implemented behaviour and product intent — a plan must not present a proposal as already delivered, and must not silently contradict product intent without saying so.

## What to flag

Every bullet below describes a **defect**. If the plan does the thing described, that is a finding. Nothing in this section describes what a good plan looks like, so never read a bullet as a requirement to check off, and never report that the plan satisfies one.

### Scope and outcome

- No stated outcome, so the only definition of done is "the steps are done" and nobody can tell whether building it worked.
- Work belonging to a different stage or slice riding along inside this one.
- Work the plan's own stated scope promises and then never covers.
- A decision deferred with no owner and no trigger — "we'll decide later", with nothing saying when or on what evidence.
- A section pitched at the wrong altitude: one that specifies every line is a diff, one that says "add the feature" is a title. Name the section and say which way it misses.

### Fit with the master plan

- The plan and the master plan's definition of this slice disagreeing on the boundary. Quote both.
- The same work owned by two plan documents.
- A dependency the plan takes for granted that another plan or a prior stage has not shipped yet.
- A status marker or stage label that no longer matches reality — a step marked done whose code is not in the branch, or work placed ahead of a stage it depends on.
- A change here that the master plan has to absorb, where this plan never says to update it.
- Product intent in `docs/requirements/product/PRODUCT.md` silently superseded, with no mention of it.

### Grounding in the code

- A file, route, module, component, or config key named in the plan that does not exist, or exists under a different name.
- Behaviour the plan assumes — a field already nullable, a job already retrying, a check already applied — that the code does not actually do. Name the file that contradicts it.
- A helper, service, component, util, or migration the plan proposes to build that the repo already has. Name the existing one.
- A step written as one line that actually touches a chain of route, contract schema, application logic, and persistence.
- Domain vocabulary drifting from what root `AGENTS.md` and the product requirements use, so the plan and the code name the same thing differently.

### Approach and architecture

- A design that cuts across the layering the codebase already uses (routes/application/persistence on the backend; feature/core/shared on the frontend).
- A heavier shape than the job needs, where something the repo already has does the same work.
- Data model changes that will bite: a non-nullable column added to a populated table with no default, a rename or drop with no migration path, a new query pattern with no index behind it.
- Something exposed to the browser that the plan treats as internal — credentials, an unscoped record, an admin surface with no access model.
- Cost the plan creates and never accounts for: per-item queries, per-request work with no bound, a cache with no invalidation path or no TTL.
- A new framework, provider, or infrastructure dependency introduced with no approval noted, contrary to root `AGENTS.md`.

### Sequencing and release order

- A step that leaves the tree unshippable — half a migration, or a client calling a route that only lands two steps later. Name the step.
- A step needing a manual operation (a database reset, a migration window, a one-off script) with that constraint unnamed where the step sits.
- A contract change that requires `pnpm api:generate` afterward, unstated.
- Parallelisable work serialised for no reason, and serialised work the plan wrongly parallelises.

### Verification and risk

- Steps with no way to prove they worked — a verification section that says "test it", or none at all.
- A feature or a bug fix with no covering test named and no path for where that test lives.
- The plan's most likely failure with no way back — no flag to turn off, no reversible migration, no stage that can ship alone.
- A rule enforced in more than one place — a limit, a validation, a default — where the plan changes only one of them.

### Documentation follow-through

- User-visible behaviour changed with no matching update to `README.md` or the relevant `AGENTS.md`, contrary to root `AGENTS.md`'s instruction to keep docs current.
- A capability described as available that is actually still planned — assistant execution, distributed queues, checkout, repair booking, or hosted deployment, per root `AGENTS.md`'s product boundaries.
- New domain vocabulary or a settled decision that belongs in a requirements doc, left only in the plan.
- No concise progress file for the plan, or one that exists but the plan does not reference, or one that is stale against what the plan and the code actually show as done.

### How the plan is written

- Passages recounting how the plan got here — an earlier iteration, a previous approach, a discussion that settled something. They send the reader hunting for context they never needed and change nothing about what gets built.
- A requirement written as a negation, "opens a full-page modal, not an alert", which leaves the builder guessing whether the rejected option still lurks somewhere in scope.
- An alternative argued down that the document never proposed.
- A justification made where the decision is taken and then made again in a later section.
- A step too vague to carry out — no file, no surface, no criterion for done.
- A step burning paragraphs on mechanics the builder does not need in order to follow it.
- Status claims that contradict each other, such as a step marked done above a section listing it as outstanding.

## Output

Group findings under the eight headings above (do not number the headings). Skip any heading you found nothing for — six real findings under one heading beats one per heading. Never invent, pad, or downgrade a nit into a finding to give a section something to hold. A review with two findings is a fine review, and so is a review with none. Number every finding, with a single sequence running unbroken across all eight groups — the first finding is 1 and the count keeps climbing into the next group, so no number appears twice in the review.

Each finding takes this shape: a numbered short title, then the location, then the problem, then the fix.

```
### 3. Stage 4 plans the discovery citation step Stage 2 already ships
   [poc-scaffolding.md:120](docs/plans/poc-scaffolding.md#L120)
   The stage-4 section describes attaching citations to discovered facts, which the stage-2 section already covers and the code already implements in `application/discovery.ts`.
   Fix: cut the section from stage 4 and replace it with one line pointing at stage 2, keeping only whatever stage 4 actually adds beyond it.
```

The title is a few words naming the problem — readable on its own, no filename in it. Every finding carries a `Fix:` line with a concrete change, never a restatement of the problem. Where one finding spans several documents or files, list the extra locations on the location line rather than splitting it into separate numbers.

Write the problem in plain concise prose: what actually goes wrong, in terms of what the person building from this plan ends up doing, or what the app or the user ends up with. Name a symbol only when that symbol is the thing at fault and has to be named to point at it — never as shorthand for a step in a sequence, and never as the whole explanation. A reader who has not opened the plan should follow the problem from the sentence alone.

The `Fix:` line can be more specific: it names documents, sections, files, and symbols exactly, because it is an instruction to carry out, but still describes the fix in brief plain prose.

I reply by number ("do 3 and 7, skip 5"), so a number must identify exactly one finding. Order by impact within each group. State what a finding is, not what it isn't. For every reuse suggestion, name the existing plan section, document, module, or component to point at, or the exact new file path to create if none exists. Skip wording and formatting nits unless they change what someone would build.

After the last finding, add a short list under the heading `Needs my call`, naming the findings whose fix is not obvious or is mine to decide. Give each one as its number, its title, and a single line stating the choice I have to make. A finding belongs here when its `Fix:` line rests on a judgement rather than a mechanical change — a trade-off between two viable approaches, a scope or release-ordering decision, work that has to move to another stage or plan, or a change whose blast radius reaches past this plan. Leave the heading out entirely when every fix is clear, and never list a finding whose fix is already concrete and uncontested.

Nothing else follows the findings. No trailing summary, no recap, no closing commentary — only the `Needs my call` list.
