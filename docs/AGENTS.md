# Boring Things research

Boring Things is an AI that helps people track and manage life administration across appliances, memberships, subscriptions, utilities, and service providers, by finding manuals, answering questions, scheduling repairs and maintenance, offering upgrades, and more.

## Structure

Polished planning, research and settled decisions are organized into:

- `requirements/product/PRODUCT.md`: **What is the problem we're solving?**
  Problem, personas, use cases, feature roadmap, compliance expectations.

- `requirements/marketing/MARKETING.md`: **How do we find and connect with customers?**
  Goals, brand direction, channels, key messages, campaign ideas.

- `requirements/commercial/COMMERCIAL.md`: **How does it make money?**
  Competitors, market framing, opportunity, revenue model, operating costs, risks.

- `requirements/technology/TECHNOLOGY.md`: **How does it work?**
  Stack decisions, architecture, data domain, integrations, delivery plan.

The following are used as working documents and are more freely updated.

- `requirements/research/sources.md`: citable sources and stats used across docs.
- `requirements/research/assumptions.md`: explicit assumptions and unresolved questions that still need validation.
- `requirements/roadmap/MILESTONES.md`: staged execution plan.
- `meeting-notes/`: dated discussion records; preserve their historical context.
- `plans/`: scoped implementation plans. `plans/poc-scaffolding.md` records confirmed scaffold decisions and subsequent work. `plans/poc-frontend.md` stages the Figma-based frontend rebuild; `plans/poc-frontend-progress.md` tracks it. `plans/app-state.md` designs the front-end stores, domain services and optimistic mutations.
- `setup/`: operational setup instructions, including Logto.
- `agents/`: agent behaviour and GitHub issue conventions, referenced from root `AGENTS.md`.

Paths above are relative to `docs/`. Root `README.md` describes implemented behaviour and local commands. Requirements express product intent; plans can contain unimplemented work. Do not present a proposal as a delivered capability. For the scaffold, confirmed plan decisions refine earlier requirements, including the use of Angular and Logto.

## Writing conventions

Research-doc-specific conventions (evidence, sourcing, examples): `docs/agents/agent-behaviour.md`. General agent conduct and doc-organisation rules: same file, referenced from root `AGENTS.md`.
