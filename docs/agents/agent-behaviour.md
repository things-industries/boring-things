# Agent behaviour

Standard all agent work in this repo must comply with, referenced from root [`AGENTS.md`](../../AGENTS.md#agent-behaviour). Code conventions live in [`src/AGENTS.md`](../../src/AGENTS.md) (frontend) and [`server/AGENTS.md`](../../server/AGENTS.md) (backend). GitHub issue conventions live in [`github-issues.md`](github-issues.md).

## Conduct

- Never refer to yourself in the first person. Write tersely. Avoid unnecessary adjectives and contrastive framing.
- Preserve user-authored and unrelated working-tree changes. Keep secrets and private user data out of source control.
- Complete the authorised task. Ask about preferences or intent when the answer materially affects the result; continue independent work while awaiting an answer.
- Report what changed, validation performed and anything unverified. Distinguish implemented behaviour, accepted plans and proposals.
- Do not create issues, send messages or publish changes unless authorised by the task.

## Keep docs current

- When a decision fundamentally changes the product, flow or domain model, update `docs/requirements/product/PRODUCT.md` in the same piece of work.
- When setup or architecture changes materially, update `README.md` and the relevant `AGENTS.md`.
- Docs describe the current state and direction. Remove superseded guidance rather than leaving contradictory versions side by side. Remove references to plans in root `AGENTS.md` once they are complete or no longer relevant.

## Keep top-level agent files small

- A top-level `AGENTS.md` (root, `src/`, `server/`, `docs/`) is a map, not a manual: summarise and link to a detail file instead of inlining it, the way root `AGENTS.md`'s "Read when relevant" section does.
- This keeps initial context small; an agent expands a linked file only when the task actually touches that topic.
- When a top-level file's section grows past a summary, move the detail into a scoped file (here, under `src/`, `server/` or `docs/`) and leave a pointer behind.

## Record preferences

When the owner gives a preference in the form "do this instead of that", write it down so it is followed and repeated in future work:

- Frontend code style: `src/AGENTS.md`
- Backend code style: `server/AGENTS.md`
- How agents work, communicate or maintain the repo: this file or root `AGENTS.md`

State the preference as a rule, not as a record of the conversation it came from.

## Keep docs and agent files organised

- Each doc and agent file has a scope. Keep content within it.
- Before adding content, find the file where it belongs. If none fits, propose a new file rather than stretching an existing one.
- When you notice content out of scope, or the same guidance repeated across files, move or consolidate it.

## Refactoring

- Look for opportunities to refactor instead of repeating code blocks or styles.
- Always ask before refactoring. Describe the duplication and the proposed change, then wait for approval.

## Comments

- Use comments sparingly.
- Only comment what would be hard to understand by reading the code alone.
- Do not write verbose comments.
- Adding comments in code should be minimal and only ever describe a method, a function, a class, or a complicated procedure that without a comment would be hard to read or understand.
- Do not explain the background story of why something was added or changed. The only exception is a workaround for a limitation or bug outside the codebase's control.

## Writing documents, PRs, issues

Do not include information about previous discussions leading to decisions, facts and changes you are documenting or describing. It doesn't matter what was discussed earlier, or previous iterations of that document. Do not explain the background story of the document. A document does not need "previously the plan was...but now it's..." - simply describe the plan. A PR does not need "The previous branch/PR carrying this change went stale..." it's a new PR with changes. Describe the changes, don't worry about the history that led to this PR existing.

State a requirement as what it is, never as what it is not. Write "opens a full-page modal", not "opens a full-page modal, not an alert". A rejected option that was only ever a draft, an earlier iteration, or something raised in conversation is not part of the requirement and does not belong in the document — its presence just tells the reader to wonder what they missed. The rare exception is a deliberate departure from an established convention in this codebase, where naming the convention is what stops someone "correcting" it back: say which convention and why, in one sentence, and only where the departure lives.

The same applies to justification. Give the reason a decision needs to survive review, once, where the decision is made. Do not re-argue it in the next section, and do not argue against alternatives nobody reading the document proposed.

See [`github-issues.md`](github-issues.md) for issue-specific title, label and body conventions.

## Writing research docs

Applies to `docs/requirements/`, `docs/meeting-notes/` and other research/planning docs:

- Organise by sections; prefer concise bullets over long narrative blocks.
- Keep research claims evidence-backed; add source links to `docs/requirements/research/sources.md`. Label assumptions and inference.
- Update paths and command examples against the repository.
- Use synthetic or redacted examples for private records, documents and identifiers. Keep credentials out of setup instructions and screenshots.
