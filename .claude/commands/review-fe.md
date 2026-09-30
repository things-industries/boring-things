---
description: Review front-end changes for UX, reusable components/services, and reusable styles
allowed-tools: Read, Grep, Glob, Edit, Bash(git *), Bash(pnpm lint*), Bash(pnpm typecheck*), Bash(pnpm test*)
---

Review the front-end uncommitted changes. If nothing is uncommitted, review the changes in the branch. Report findings only — do not change code unless I ask. The one file you may write to is [docs/css-refactoring-opportunities.md](../../docs/css-refactoring-opportunities.md), under the rule below.

## Scope

Target: $ARGUMENTS

If no target is given, review the uncommitted working tree plus any commits on the current branch that are not on `main` (`git diff main...HEAD` and `git status`). If a branch, commit range, PR number, or path is given, review that instead.

Front-end code is everything under [src/](../../src/) plus [public/](../../public/). Server changes under [server/](../../server/) belong to `/review-be`; mention one only where it changes what the client can rely on.

Read the full current version of every changed file, not just the diff hunks — reuse and duplication are only visible with the surrounding file in view. A component is three files, so read the `.ts`, `.html` and `.scss` together. Then grep the rest of the repo for the patterns you see in the diff; the duplicate usually already exists outside the changed files.

Read [src/AGENTS.md](../../src/AGENTS.md) and [src/styles/CHEATSHEET.md](../../src/styles/CHEATSHEET.md) before writing a finding — the conventions below are theirs, and the cheat sheet is the list of tokens, roles, mixins and global classes that already exist.

## What to look for

### UX

- Loading, empty, and error states: does every async surface have all three, and does the skeleton or placeholder match the real layout?
- Destructive or irreversible actions: confirmation, undo, or clear consequence copy.
- Optimistic updates that never roll back on failure, or that leave the user with no feedback that the action failed.
- Long-running or background-tracked operations (imports, generation, sync) whose intermediate states never reach the user, or that leave a failure with no way forward.
- Touch targets, disabled-vs-hidden controls, and whether a disabled control explains why it is disabled. Design is phone-viewport-first per `src/AGENTS.md`.
- Form UX: validation timing (on blur/submit rather than on every keystroke), error copy that says how to fix, keyboard/enter behaviour, focus after submit.
- Accessibility: accessible names on icon-only controls, decorative icons marked `aria-hidden="true"`, alt text, colour used as the sole signal, heading order. `<a>` only for navigation and `<button>` for every other action, including toggles and disclosures.
- Navigation: back behaviour, deep-link/refresh survivability, whether a surface should be a route rather than in-page state. Feature pages stay lazy-loaded per `src/AGENTS.md`.
- Copy: all user-facing text lives in the template, never in TypeScript — visible text, accessible names, alt text, placeholders, labels, empty/loading/error messages, confirmation text, validator messages. TypeScript exposes a status, error code or enum and the template picks the copy. A label map living in TypeScript is a finding.
- Data returned from the API treated as copy and rewritten in the client instead of bound directly as content.
- Sensitive or masked field values handled inconsistently with their masked/reveal state, or persisted somewhere they should not be (browser storage) per `src/AGENTS.md`.

### Repeated HTML → components

- Template blocks repeated within a file or across files (cards, list items, headers, section headings, empty states, chip clusters, progress bars, confirmation surfaces).
- Check [src/app/components/](../../src/app/components/) first: a component that already does the job is a stronger finding than a new one.
- Inline templates or inline styles instead of separate `.ts`, `.html` and `.scss` files.
- A new component living in a feature folder while being used by a second feature, or a single-feature component pushed into `app/components/` before anything else needs it.
- Distinguish real duplication from coincidence — two blocks that look alike but change for different reasons should stay separate. Say which it is.

### Repeated TS → services, stores, utils, validators

- Logic duplicated across components that belongs in a feature data service, or in [src/app/core/](../../src/app/core/) when it is application-wide and singleton-like.
- Network calls made from a presentation component instead of a feature data service or the typed API client in [src/app/core/api/](../../src/app/core/api/), and absolute or environment-specific backend origins instead of relative `/api` paths.
- Hand-written request or response interfaces that duplicate the generated types in root [shared/api.ts](../../shared/api.ts) instead of importing or deriving from them.
- Response mapping done inline in a component where the feature's data service should own it.
- Constants — batch sizes, thresholds, polling intervals, storage keys — declared as module constants in feature files instead of [src/app/core/app.config.ts](../../src/app/core/app.config.ts).
- Exported interfaces or types left in a component or service file instead of a concept-named file in [src/app/interfaces/](../../src/app/interfaces/).
- Helpers reinvented instead of an existing one in [src/app/utils/](../../src/app/utils/), or a new helper written inside a component instead of a concept-named file there. A catch-all `utils.ts` is a finding on its own.
- Form validators written inline in a component instead of `app/validators/<concept>.validator.ts` — every validator belongs there, even one used by a single form — and validators returning messages instead of error keys, per `src/AGENTS.md`.
- Hand-rolled date maths: millisecond arithmetic, manual month rollover, bespoke parsing or formatting. `date-fns` is the sanctioned date library; put anything it has no function for in `app/utils/date.util.ts`.
- State in the wrong place: component-only state stays a local signal, state shared between components belongs in a service holding private writable signals exposed through `asReadonly()`. No global store library is installed per `src/AGENTS.md` — a new one introduced without approval is a finding.
- Repeated signal/computed wiring, subscription plumbing, or effect blocks that should be one shared helper. Writes to signals inside `effect` are a finding.
- Angular idiom drift from `src/AGENTS.md`: `input()`/`output()`/`model()` over decorators, `inject()` in field initialisers over constructor parameter injection, `signal()`/`computed()` over plain properties, `@if`/`@for`/`@empty` over `*ngIf`/`*ngFor`, standalone components, eager imports of a feature page that should be lazy.
- Icons imported anywhere other than [src/app/core/app-icons.ts](../../src/app/core/app-icons.ts), exported under a name that describes the picture instead of the use, or a fill variant used for something that is not a selected/emphasised state.
- Product or private data written to browser storage where only device-local preferences belong there.
- Database, Supabase, Logto or AI credentials reaching client configuration.
- A missing or wrong API contract worked around by inventing a client-side shape with no isolation, label, or documentation, per `src/AGENTS.md`.

### CSS → tokens, mixins, global styles

- Hard-coded values where a token exists: colours, spacing, radii read through the project's token functions rather than literals.
- Text coloured with a raw value or a bespoke class where a semantic text-colour role already exists.
- Text or icons placed on a fill without that fill's matching contrast role.
- Snowflake text styles that duplicate an existing typography role.
- Re-implemented mixins where [src/styles/_mixins.scss](../../src/styles/_mixins.scss) already covers the pattern (focus rings, surfaces, visually-hidden text, and similar).
- `@import` instead of `@use`, or a relative path into `src/styles` where it is already on the Sass include path.
- CSS emitted from a token/typography/mixin partial instead of only from the core stylesheet, per `src/AGENTS.md`.
- The same block of declarations repeated in two or more component stylesheets — candidate for a global class, a mixin, or a token.
- A global rule or a new global class added for one component's benefit, and a component stylesheet reaching outside its own component to restyle a shared element.
- `!important` used to win a fight a token or a specificity fix would settle.
- A token, role, mixin or global class added or changed without the matching update to [src/styles/CHEATSHEET.md](../../src/styles/CHEATSHEET.md) in the same change.
- Layouts that assume a wide viewport, fixed pixel widths that overflow a phone screen, or breakpoints written as bare media queries.
- Note when a style is genuinely component-local: not every repeat belongs in global scope, and over-globalising is its own bug.

### Tests

- New features or fixed bugs in this diff with no covering test, per `src/AGENTS.md`.
- Specs that assert on internal calls rather than on rendered output or public state.
- Fake services hand-rolled where an existing fake already covers the dependency.
- Code shaped so it cannot be tested in small units — logic buried in a template binding, a constructor, or an effect rather than a method or a util.
- Accessible behaviour introduced with no assertion on it — `aria-pressed`, accessible name, `type="button"`.

## Pre-existing CSS findings

Duplication, hard-coded values, and consolidation ideas you notice in files this change did not touch do not belong in the review — they are not this diff's problem. Record them in [docs/css-refactoring-opportunities.md](../../docs/css-refactoring-opportunities.md) instead: read it first, add each one under the existing heading that already covers it, and only open a new heading when none does. Create the file with a short intro paragraph if it does not exist yet. Add the specific file paths, and skip anything the doc already lists. Then say in one line what you appended.

## Output

Group findings under the five headings above (do not number headings). Skip any heading you found nothing for — five real findings under one heading beats one per heading. Never invent, pad, or downgrade a nit into a finding to give a section something to hold. A review with two findings is a fine review, and so is a review with none. Number every finding, with a single sequence running unbroken across all five groups — the first finding is 1 and the count keeps climbing into the next group, so no number appears twice in the review.

Each finding takes this shape: a numbered short title, then the location, then the problem, then the fix.

```
### 3. Missing empty state on the Things list
   [dashboard.page.html:42](src/app/features/dashboard/dashboard.page.html#L42)
   The list renders nothing when the owner has no Things yet, so the screen reads as broken rather than empty.
   Fix: add an `@empty` block to the `@for` with an empty-state pattern matching the one already used elsewhere in the dashboard, with the copy in the template.
```

The title is a few words naming the problem — readable on its own, no filename in it. Every finding carries a `Fix:` line with a concrete change, never a restatement of the problem. Where one finding spans several files, list the extra locations on the location line rather than splitting it into separate numbers.

Write the problem in plain concise prose: what actually goes wrong, in terms of behaviour the user or the app ends up with. Name a symbol only when that symbol is the thing at fault and has to be named to point at it — never as shorthand for a step in a sequence, and never as the whole explanation. A reader who has not opened the file should follow the problem from the sentence alone.

The `Fix:` line can be more specific: it names files, symbols, classes, and variables exactly, because it is an instruction to carry out but also uses plain language to outline the fix.

I reply by number ("do 3 and 7, skip 5"), so a number must identify exactly one finding. Order by impact within each group. State what a finding is, not what it isn't. For every reuse suggestion, name the existing component, service, util, validator, token, role, mixin, or class to use, or the exact new file path to create if none exists. Skip pure formatting nits — Prettier and ESLint own those.

After the last finding, add a short list under the heading `Needs my call`, naming the findings whose fix is not obvious or is mine to decide. Give each one as its number, its title, and a single line stating the choice I have to make. A finding belongs here when its `Fix:` line rests on a judgement rather than a mechanical change — a trade-off between two viable shapes, a product, UX, or copy decision, a refactor across shared components or global styles, or a change whose blast radius reaches past this diff. Leave the heading out entirely when every fix is clear, and never list a finding whose fix is already concrete and uncontested.

Nothing else follows the findings. No trailing summary, no recap, no closing commentary — only the `Needs my call` list, and the one line naming what you appended to the CSS doc.
