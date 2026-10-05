# Import improvements

Status: stages 1, 2, 4, 5 and 6 implemented. Stage 3 is deferred; stages 7–8 are pending.

## Implemented stages

| Stage | Behaviour                                                                                   | Documentation                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Named AI operations, application-owned batching, SDK transport and authored prompts/schemas | [Import lifecycle](../setup/imports.md#sequence), [backend conventions](../../server/AGENTS.md#ai-imports-and-assistant-work)                      |
| 2     | Registry mappings, useful custom fields and discard decisions with atomic checkpoints       | [Mapping](../setup/imports.md#sequence), [fact evaluation](../requirements/research/import-evaluations.md#fact-selection-evaluation)               |
| 4     | Public research eligibility from `instanceSpecific` metadata                                | [Research](../setup/imports.md#sequence)                                                                                                           |
| 5     | Category documents and progressive cited field enrichment                                   | [Research](../setup/imports.md#sequence), [model evaluation](../requirements/research/import-evaluations.md#reference-extraction-model-evaluation) |
| 6     | Validated official product photographs with owner-choice preservation                       | [Images](../setup/imports.md#sequence)                                                                                                             |

The following stages describe planned work. Preserve sources, ownership, sensitivity, provenance, per-set values, owner edits and retry checkpoints throughout.

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

## 7. Shared reference assets

Introduce system-managed reference assets for independently verified public documents and images. Owner-scoped attachments can reference these assets while retaining their own metadata and Thing associations. Private uploaded sources retain owner scope.

Record source URL, content hash, document type, applicability, language and version. Search known assets before external research. Track every reference for deletion and blob lifetime. Preserve authenticated attachment access and keep private account associations out of shared metadata.

Acceptance: two owners can reuse the same verified reference bytes; deleting one owner's association preserves the other's access; private uploads remain isolated. Update attachment persistence, blob handling, API access and lifecycle integration tests together.

## 8. Further latency and provider experiments

Use measured stage timings to decide whether a separate identification pass helps. A fast pass must establish coverage sufficient to identify one subject before Thing creation. Long documents may require page-aware extraction; scanning opening pages alone cannot establish a single subject. Represent truncation and insufficient coverage explicitly. Measure the cost of reading the same source twice.

Evaluate Jev for bounded decisions over extracted evidence and Firecrawl for source retrieval only when the baseline identifies a relevant bottleneck. Provider adoption remains a separate decision. Compare the whole task, including extraction, searches, retries and validation. [Research references](../requirements/research/sources.md#import-provider-evaluation--4-october-2026) record the documentation used for these experiments.

## Validation

- Stage 3 needs integration/browser coverage for progress before Thing creation, identity decisions, terminal errors, migrations and retries.
- Stage 7 needs coverage for cross-owner byte reuse, authenticated access and deletion lifetimes.
- Stage 8 needs labelled evaluations measuring retrieval success, field precision/recall, unwanted custom fields, latency and task cost.
- Follow [repository validation](../../README.md#validation). Maintain [product requirements](../requirements/product/PRODUCT.md) and the [import guide](../setup/imports.md) when delivered behaviour changes.
