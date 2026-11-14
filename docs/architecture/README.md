# Architecture

Boring Things runs an Angular client and a Fastify API in one TypeScript repository. The client calls relative `/api` routes. Logto verifies identity, and Fastify maps that identity to a local user and enforces user access. Render serves the compiled client and API from one service to keep fixed costs low. Supabase PostgreSQL stores structured records. The same blob interface uses the local filesystem in development and a private Supabase Storage bucket in production. See the [deployment guide](../setup/deployment.md) and [Logto setup](../setup/logto.md).

## Sources of truth

- [OpenAPI](../../openapi.json) defines the HTTP contract. Fastify uses it for runtime schemas, and both applications use the generated types in `shared/api.ts`.
- [SQL migrations](../../supabase/migrations/) define the database schema. The [registry seed](../../server/src/db/seeds/registry.ts) owns category, fieldset and field metadata. Stable registry IDs let existing Things continue to refer to the same definitions when seed metadata changes. Incompatible changes need a migration for stored values.
- The [frontend guide](../../src/AGENTS.md) and [backend guide](../../server/AGENTS.md) describe module boundaries and coding conventions. The [product requirements](../requirements/product/PRODUCT.md) describe user-facing intent.

## Domain decisions

- A Thing has one category, which can be corrected. Tags organise a user's Things. Shared collections require their own access model.
- Fieldsets belong to a category. Reusable definitions describe values, while each Thing Field stores its value in its own fieldset context. Buildings and contents can therefore use the same sum-insured definition and still have independent values. Standalone and custom fields have their own addresses. Section grouping in the UI keeps the original address for editing, pins and citations.
- `includes` declares mandatory dependencies. `considerAlongside` suggests sets whose eligibility is checked separately. One occurrence of each set is allowed per Thing. Use the most specific eligible set and keep distinct field definitions independent even when labels match.
- Field scope determines what a value describes and whether it can inform public research. Identifier status determines whether it can help identify a Thing. Sensitivity independently controls visual masking and redaction from chat and task scheduling inputs.
- A Thing can use a linked image as its main image and falls back to category artwork. [Import](../setup/imports.md) explains how uploads, shared public resources and image selection interact.
- [Tasks, Events and Thing dates](tasks.md) defines scheduling, recurrence, timeline and followup behaviour. [Frontend design](frontend.md) records how the client implements the design. [App state](app-state.md) covers data flow and optimistic updates.

## Background work and assistant

One runner per database coordinates independent serial processors for persisted Imports and recommendations, Attachment transcription, and assistant messages. An Import can wait for transcription while that processor continues. Thing and conversation SSE streams publish committed state so clients can recover snapshots after reconnecting. See [execution and recovery](../setup/imports.md#execution-and-recovery) for how the runner coordinates deployments.

Application workflows own access, validation, writes and recovery. Task classes own model settings and prompts. Specialist providers propose registry values through the same permission-checked writer as other automatic operations. Chat actions save changes and retry receipts together so retrying a message does not repeat a committed write. See the [Import workflow](../setup/imports.md) and [backend guide](../../server/AGENTS.md#ai-imports-and-assistant-work).
