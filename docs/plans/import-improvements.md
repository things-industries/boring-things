# Import improvements

<!-- Tracks staged import improvements, dependencies and acceptance criteria; marks implemented stages. -->

Status: stages 1, 2, 4 and 5 implemented. Stages 6–8 are pending; stage 3 is deferred.

Imports should extract source information, identify one Thing, populate useful fields and enrich missing information from cited sources. Results become available progressively. Original sources, owner edits, explicit clears and provenance remain preserved.

Each stage has its own acceptance criteria and can be delivered separately. Stages 3 and 6–8 specify planned behaviour; [the import process guide](../setup/imports.md) describes the current implementation.

## Decisions

- Persist an import against its source attachment. Create a Thing after identifying one subject, or populate an explicitly supplied or unambiguously matched existing Thing.
- An import identifying multiple independent Things ends with an error before creating Things or populating fields. This applies to imports with an existing target too. References to compatible models and incidental mentions do not establish additional Things.
- Promote facts in this order: selected field-set fields, other registry fields, useful custom fields, then discard. The source attachment remains available.
- Use every populated field classified as `instanceSpecific: false` as available public research context. Use empty fields with that classification as enrichment targets. `sensitive` independently controls application masking.
- Define category research instructions as prompt text. Research code uses generic targets, documents and outcomes.
- Keep the persisted runner shared by imports and assistant chat, bounded work, retry checkpoints and progress after commits.
- Prefer readable application sequencing, typed boundaries and short development cycles at the current traffic volume. Keep transaction support for associated writes.
- Use namespace imports for database modules throughout the repository.

## Current implementation and change locations

| Concern        | Current behaviour and source                                                                                                                                                                                                                                                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Submission     | [Import routes](../../server/src/routes/imports.ts) call [import persistence](../../server/src/db/entities/imports.ts), creating a skeleton Thing and queued import.                                                                                                                                                                                 |
| Processing     | [ImportProcessor](../../server/src/application/import/processor.ts) sequences extraction, target allocation, mapping and discovery. [JobRunner](../../server/src/application/jobs/runner.ts) also processes assistant work.                                                                                                                          |
| AI             | [OpenAiImports](../../server/src/providers/ai/openai-imports.ts) uses the SDK for structured requests, registry conversations and research; prompts and schemas live in separate provider files. [OpenAiChat](../../server/src/providers/ai/openai-chat.ts) uses SDK streaming and task prompts.                                                     |
| Fact retention | [Mapping](../../server/src/application/import/mapping.ts) applies explicit registry, useful custom-field and discard decisions, with atomic retry checkpoints. It builds research context and targets from field metadata.                                                                                                                           |
| Research       | [Discovery](../../server/src/application/discovery/discovery.ts) persists cited names, PDFs, maintenance suggestions and products. [Reference enrichment](../../server/src/application/import/research.ts) fills eligible missing fields from applicable PDFs. Image retrieval is pending.                                                           |
| HTTP boundary  | [The route helper](../../server/src/contracts/routes.ts) supplies contract types, validation and response schemas. [Thing routes](../../server/src/routes/things.ts) perform separate record lookups.                                                                                                                                                |
| Client         | [ThingsStore](../../src/app/core/state/things.store.ts), [ImportsService](../../src/app/core/data/imports.service.ts) and [AddThing](../../src/app/features/add-thing/add-thing.ts) depend on an immediately returned Thing ID. [ImportProgress](../../src/app/features/things/import-progress.ts) offers retry; the client has no selection action. |

## Delivery order

| Stage | Deliverable                                                 | Dependency                                                 |
| ----- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| 1     | Readable workflows, prompts, schemas, SDK and DB references | First review checkpoint                                    |
| 2     | Useful fact selection                                       | 1                                                          |
| 3     | Import identity and single-Thing lifecycle                  | 1; can ship independently of 2                             |
| 4     | Research eligibility from field metadata                    | 1                                                          |
| 5     | Category research and document-based field enrichment       | 1 and 4; uses the existing mapper and submission lifecycle |
| 6     | Thing images                                                | 5                                                          |
| 7     | Shared reference assets                                     | Stable document and image retrieval                        |
| 8     | Further latency and provider experiments                    | Evaluation evidence from earlier stages                    |

Create a small fixture baseline in stage 1 and extend it with each behaviour change. Stage 5 includes model cost evaluation for document extraction; that work belongs with the task's implementation.

## 1. Readable workflows and provider boundary

Implemented: awaited provider selection and fact batches, application-owned batching and commits, SDK import/chat adapters, task prompts, authored response/tool schemas with generated type checks, extraction boundary adapters and database namespace imports. The synthetic hob, van and combined-policy fixtures run through SDK extraction; provider and integration tests cover interruption, cancellation, tool history and progressive commits. Live model quality and cost remain unmeasured.

Scope:

- Make the application importer sequence explicit awaited operations: extract source, select field sets, map fact batches, research. The application owns batching, validation, persistence and notifications. Commit each complete validated batch.
- Replace the mapping generator/iterator protocol with named provider calls returning typed results. Retain retrieved-definition validation, tool budgets, timeouts and retry behaviour.
- Move AI prompts into `server/src/providers/ai/prompts.ts`, organised by task, including chat prompts and shared instructions. Define a Thing and how subjects differ from incidental references. Keep initial prompt behaviour stable while relocating it; category research content is populated in stage 5.
- Move provider output and tool schemas into an authored JSON Schema document under `server/src/providers/ai`. Describe field meaning, supported values and evidence requirements. Use constraints supported by the configured provider; retain application validation. Keep schemas and TypeScript types aligned through generation or consistency checks.
- Adopt the official OpenAI TypeScript SDK for the import and chat adapters. Preserve storage settings, cancellation, usage accounting, error sanitisation, response completion checks and bounded retries. Keep SDK types inside the provider boundary.
- Separate tool-free structured requests, registry tool conversations and output validation. Name the accumulated provider history `conversation`; make its lifetime and mutation visible. Extraction uses structured output even though it offers no tools.
- Use `ExtractedThing` for an identified source subject and `ResearchContext` for information supplied to research. Name associated collections `extractedThings`. Adapt existing persisted and HTTP representations at their boundaries until stage 3 migrates them.
- Namespace every runtime import from database modules, including routes, application workflows, other DB modules, scripts and tests: for example, `importsDb.saveExtraction(...)`, `thingsDb.getOwnedThingOrThrow(...)` and `database.transaction(...)`. Named type imports remain suitable. Keep `dbPool` for the assembled pool.
- Use names that reveal lookup, existence-check, lock and persistence effects. Preserve existing transaction helpers and their ability to share an executor.

Acceptance:

- A reader can follow the import stages from one application function and find every AI prompt and response schema without reading transport code.
- Import and chat provider tests pass through the SDK boundary, including tool rounds, streaming, cancellation and incomplete responses.
- Existing import results, retry checkpoints, API responses, ownership checks and progressive commits retain their behaviour.
- Review readability at this checkpoint before starting larger changes.

## 2. Useful fact selection

Implemented: complete per-batch dispositions, guarded registry/custom writes, legacy unedited-field reconciliation and private extraction checkpoints committed with Thing updates. Retries reuse selected sets and process unfinished facts. Existing completed Things retain their fields. Tests cover dispositions, rollback and retry. A live `gpt-5.6-sol` check mapped a synthetic Neff Z-number, retained its installer reference and discarded an unexplained marking; broader usefulness evaluation remains pending. See [the fact-selection evaluation](../setup/imports.md#fact-selection-evaluation).

Replace unconditional custom-field retention with an explicit disposition for each processed fact:

1. Map to a semantically matching field in a selected set.
2. Search for a matching standalone registry definition.
3. Create a custom field for information with identifiable value in operating, maintaining, identifying or administering the Thing.
4. Discard information that fails those criteria.

Keep extracted facts in persisted processing input while work is unfinished. Record whether a fact was mapped, retained as custom, deliberately discarded or remains unprocessed. An interrupted response leaves unfinished facts available for retry. Preserve useful conflicting evidence without overwriting owner decisions.

Acceptance:

- An unexplained label marking is discarded; a useful unmatched attribute becomes a custom field.
- Matching prioritises selected sets and preserves independent `(fieldSetId, fieldId)` values.
- Retry preserves values, explicit clears, sensitivity, citations and identifiers with leading zeroes.
- Existing authored custom fields remain intact. Source files remain accessible even when facts are discarded.

## 3. Import identity and single-Thing lifecycle

Proposed HTTP contract, authored in OpenAPI during implementation:

| Operation                                      | Purpose                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `POST /api/attachments/{attachmentId}/imports` | Accept an optional `targetThingId`; return 202 with `importId`, `status` and nullable `thingId`. |
| `GET /api/imports/{id}`                        | Return persisted progress, result Thing ID, error and usage.                                     |
| `GET /api/imports/{id}/stream`                 | Send authenticated, revisioned import snapshots before and after a Thing is available.           |
| `POST /api/imports/{id}:retry`                 | Resume eligible transient failures using saved work.                                             |

Use existing `ImportStart`, `ImportAccepted` and `Import` contract components where their revised meanings fit. Stream summaries omit raw extraction and private source content.

Flow:

1. Validate ownership of the attachment and any explicit target. Persist the import and wake the existing runner.
2. Supply existing Thing context when provided. Identify subjects, relevance, category and instance identity. Complete the single-subject check before creating or populating a Thing.
3. Zero identified Things produces `FAILED` with a `no_thing_identified` reason. Multiple independent Things produces `FAILED` with `multiple_things`. The client shows the error and retains access to the source. These outcomes offer no selection step or automatic retry.
4. For one subject, use the explicit target or an unambiguous existing instance match; otherwise create one Thing. Manufacturer/model equality alone cannot establish an instance match. An ambiguous match produces an explanatory failure. An incompatible explicit target leaves that Thing unchanged.
5. Persist destination allocation and the attachment link together so retries reuse them. Populate fields and enrich progressively. The client can open the Thing as soon as the import exposes its ID.

The attachment's existing links never select a target implicitly. Additional independent Things cause the error even when a target was supplied. Family manuals and compatible-product references are evaluated as source context, with the identified subject controlling relevance.

Migration and client work:

- Remove `AWAITING_SELECTION`, confirmation routes and selection payloads from the application contract and UI.
- Resolve persisted jobs in that state under the single-Thing rule. Preserve existing results, source attachments and edited records; remove an obsolete placeholder only after proving it is untouched and unreferenced by other work.
- Preserve extraction and allocated destinations on retry. Migrate stored extraction names and references consistently with `ExtractedThing`.
- Add import progress and failure UI before a Thing exists, including page reload and reconnect. Update the upload, pasted-text and existing-attachment entry points together.
- Release processing locks on every terminal outcome. Source removal and Thing deletion retain owner-scoped reference checks.

Acceptance: a one-item source creates at most one Thing across retries; a multi-item receipt fails without creating or populating Things; explicit targets remain unchanged on failure; progress and errors survive reconnect and restart.

Related scope: [#55](https://github.com/things-industries/boring-things/issues/55). Further handling of additional subjects in [#56](https://github.com/things-industries/boring-things/issues/56) remains deferred.

## 4. Research eligibility from field metadata

Implemented: migrated and seeded classifications, API/custom-field metadata and typed public context with eligible missing-field targets.

Add `instance_specific` to registry persistence and expose it as `instanceSpecific` in the API and model definitions. Seed authored classifications and migrate existing definitions. Unclassified definitions default to instance-specific until classified.

`instanceSpecific` means that the value belongs to the particular owned item, account or agreement. A policy number and acquisition date are instance-specific; a model's output power is reference information. `sensitive` independently controls masking and reveal. Neither flag is derived from the other, and sensitivity does not supply a second research eligibility rule.

Build `ResearchContext` from all populated fields with `instanceSpecific: false`, across selected sets and standalone fields. Carry field labels, descriptions, addresses and typed values. Preserve `false`, zero and empty strings as populated values. Custom fields participate when they carry an explicit `instanceSpecific` classification; unclassified custom fields remain instance-specific. Include that metadata in custom-field creation, storage and projection when enabling their participation.

Build enrichment targets from empty, non-instance-specific fields already associated with the Thing, excluding owner-cleared values. Registry metadata determines eligibility. Research can use any available eligible context; fixed field IDs and a mandatory model-number field are unnecessary.

Acceptance:

- A newly authored field classified as non-instance-specific participates without a code change.
- Tests cover both sensitivity values with both instance classifications, set-scoped and standalone fields, custom-field defaults, explicit clears and non-string values.
- Search receives only the constructed research context; raw source text remains outside the public-search input.

## 5. Category research and document-based enrichment

Implemented: category prompt text, bounded cited PDF retrieval, applicability checks, contained field extraction, guarded progressive `DISCOVERY` commits, persisted batch checkpoints and generic outcomes. The existing mapper and submission lifecycle remain in use. [Model evaluation](../setup/imports.md#reference-extraction-model-evaluation) compares three models on labelled text/PDF fixtures; the configured import model remains the default.

Add a named category research prompt function to the prompts module. Category IDs come from the registry. Author short instructions for supported categories and provide a general fallback for newly added categories.

| Category      | Initial research instruction                                                        |
| ------------- | ----------------------------------------------------------------------------------- |
| Appliances    | Find the manual for the appliance.                                                  |
| Devices       | Find the user manual and support documentation for the device.                      |
| Vehicles      | Find the owner's manual for the vehicle and its relevant variant.                   |
| Insurance     | Find the policy document matching the provider, product, region and policy version. |
| Memberships   | Find the membership terms and benefits for the provider and membership type.        |
| Subscriptions | Find the subscription terms and features for the service and plan.                  |
| Utilities     | Find the service or tariff documentation matching the provider and product.         |
| Other         | Find supporting reference documents relevant to the Thing.                          |

Research instructions are editable text. Generic research outcomes describe found resources, unavailable evidence, retrieval failure or exhausted budget. Domain-specific document priorities belong in those instructions. A public policy wording document supports general terms; an owner's private schedule remains instance-specific evidence supplied by the owner.

Workflow:

1. Build the research context and missing-field targets using stage 4.
2. Find documents matching the category instruction. Verify applicability, including model or product variant, region, language and version when relevant. Persist supported resources as they arrive.
3. Run a contained document-extraction task using verified documents, subject context and requested field definitions. Return proposed values with attachment/page/quote or URL evidence. It has no web-search or write tools.
4. Validate field addresses, types, units and evidence; fill still-empty eligible destinations with `DISCOVERY` provenance. Recheck owner edits and explicit clears at each commit.
5. Research remaining gaps within the budget. Leave unsupported values absent and report generic outcomes for unresolved research targets.

Reference-document extraction remains within this import. Its scope is the identified Thing and requested fields. Preserve explicit maintenance and product research modes used by assistant chat. Publish progress after each committed document or value batch.

### Cost evaluation within this stage

Document extraction has a bounded input and output, making it a candidate for a cheaper model. Add an independently configurable model for this task, initially falling back to the configured import model. Confirm required text, PDF and image capabilities when choosing the model.

Compare models on the same labelled documents and requested fields. Measure supported-field recall, incorrect values, variant confusion, units, citation accuracy, latency and total cost including retries. Use the cheapest tested model meeting the agreed quality thresholds. Limit input to relevant evidence while preserving page references, batch requested fields and keep output to the required schema. Permit a bounded retry or escalation for defined extraction/validation failures; unsupported facts remain absent.

Record task and model per usage entry so different models remain distinguishable. Set thresholds from the fixture baseline before changing defaults. [OpenAI cost guidance](https://developers.openai.com/api/docs/guides/cost-optimization) recommends reducing requests and tokens and evaluating smaller models; [evaluation guidance](https://developers.openai.com/api/docs/guides/evaluation-best-practices) supports task-specific comparisons. Savings for this task remain to be measured.

Acceptance: changing a category prompt changes the research target without new workflow branches; a label import gains supported field data from reference documents; private policy identifiers remain excluded; cheaper-model results pass the same validation and quality checks.

## 6. Thing images

Extend research to retrieve an applicable official product image, validate and download it, and link it as an attachment. Distinguish a product photograph from a label or document scan. Reuse download URL, address, redirect and size protections with image content validation.

Set the main image when it remains unset and the owner has neither chosen nor explicitly cleared it. Add image-choice provenance or an edit marker for that decision. An image failure leaves other results usable. Nonphysical categories may use authored category artwork.

Acceptance: label-based imports can acquire a relevant main image; owner choices and removals survive retries; invalid downloads create no image attachment. Shared bytes across accounts are delivered in stage 7. Related: [#13](https://github.com/things-industries/boring-things/issues/13).

## 7. Shared reference assets

Introduce system-managed reference assets for independently verified public documents and images. Owner-scoped attachments can reference these assets while retaining their own metadata and Thing associations. Private uploaded sources retain owner scope.

Record source URL, content hash, document type, applicability, language and version. Search known assets before external research. Track every reference for deletion and blob lifetime. Preserve authenticated attachment access and keep private account associations out of shared metadata.

Acceptance: two owners can reuse the same verified reference bytes; deleting one owner's association preserves the other's access; private uploads remain isolated. Update attachment persistence, blob handling, API access and lifecycle integration tests together.

## 8. Further latency and provider experiments

Use measured stage timings to decide whether a separate identification pass helps. A fast pass must establish coverage sufficient to identify one subject before Thing creation. Long documents may require page-aware extraction; scanning opening pages alone cannot establish a single subject. Represent truncation and insufficient coverage explicitly. Measure the cost of reading the same source twice.

Evaluate Jev for bounded decisions over extracted evidence and Firecrawl for source retrieval only when the baseline identifies a relevant bottleneck. Provider adoption remains a separate decision. Compare the whole task, including extraction, searches, retries and validation. [Research references](../requirements/research/sources.md#import-provider-evaluation--4-october-2026) record the documentation used for these experiments.

## Validation and documentation

- Extend fixtures for a useful unmatched fact, an incidental marking, multiple purchased items, a family manual, a policy, an ambiguous existing-instance match, incorrect variants, owner clears and interrupted mapping.
- Preserve ownership, masking, provenance, source retention, field membership, identifier types and retry deduplication checks.
- Add integration coverage for lifecycle, migrations, shared assets and progressive commits; browser coverage for import progress before Thing creation and terminal errors.
- Maintain a labelled model-evaluation set alongside deterministic tests. Record retrieval success against each category's instructed targets, field precision/recall, unwanted custom fields, latency and task cost.
- After code changes, run `pnpm format` and `CI=true pnpm check`, preserving unrelated work. Run relevant integration/browser checks. Update `openapi.json` and run `pnpm api:generate` and `pnpm api:check` for contract changes.
- Update [README](../../README.md), the [backend guide](../../server/AGENTS.md), [product requirements](../requirements/product/PRODUCT.md) and [import process guide](../setup/imports.md) as stages become implemented. Correct the process guide's confirmation-UI description and keep operational documentation aligned with delivered behaviour.
