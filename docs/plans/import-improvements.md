# Import improvements

Status: stages 1, 2, 4, 5 and 6 implemented. Stages 3, 7 and 8 are planned.

## Implemented stages

| Stage | Behaviour                                                                                   | Documentation                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Named AI operations, application-owned batching, SDK transport and authored prompts/schemas | [Import lifecycle](../setup/imports.md#sequence), [backend conventions](../../server/AGENTS.md#ai-imports-and-assistant-work)                      |
| 2     | Registry mappings, useful custom fields and discard decisions with atomic checkpoints       | [Mapping](../setup/imports.md#sequence), [fact evaluation](../requirements/research/import-evaluations.md#fact-selection-evaluation)               |
| 4     | Public research eligibility from `instanceSpecific` metadata                                | [Research](../setup/imports.md#sequence)                                                                                                           |
| 5     | Category documents and progressive cited field enrichment                                   | [Research](../setup/imports.md#sequence), [model evaluation](../requirements/research/import-evaluations.md#reference-extraction-model-evaluation) |
| 6     | Validated official product photographs with owner-choice preservation                       | [Images](../setup/imports.md#sequence)                                                                                                             |

The following stages describe planned work. Preserve sources, ownership, sensitivity, provenance, per-set values, owner edits and retry checkpoints throughout.

## 3. Attachment extraction and Thing processing

An attachment supplies evidence for zero, one or several Things. Persist extraction against the attachment; persist identity decisions, selected field sets, mapping and downstream checkpoints against each import destination. Retain the existing persisted runner shared with assistant chat.

### Use cases

| Source and context                                   | Planned outcome                                                                                                            |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1.1.1 Unlinked source; one unknown Thing             | Create one Thing, link the source, map and run discovery.                                                                  |
| 1.1.2 Unlinked source; one known Thing               | Match the owned instance, link the source and populate that Thing.                                                         |
| 1.2.1 Unlinked source; several unknown Things        | Create each relevant independent Thing and link the source to each.                                                        |
| 1.2.2 Unlinked source; several known Things          | Resolve each owned instance and populate each destination.                                                                 |
| 1.2.3 Unlinked source; known and unknown Things      | Reuse identified instances and create the remaining Things.                                                                |
| 1.3 Unlinked source; no Thing information            | Complete with a no-relevant-Things outcome; retain the attachment.                                                         |
| 2.1 Linked to a Thing; evidence for that Thing       | Extract or reuse evidence, add applicable field sets and map into that Thing.                                              |
| 2.2 Linked to a Thing; evidence for it and others    | Process that Thing; record other subjects for separate owner decisions.                                                    |
| 2.3 Linked to a Thing; apparently unrelated evidence | Keep the requested link, report a relevance warning and leave Thing fields unchanged. Offer the other subjects for review. |

A family manual describes applicability to product models; its model list alone is insufficient evidence of separately owned Things. Bulk receipts distinguish independent items and quantities, filter incidental purchases and preserve source page/quote references. Two units of the same model can be separate instances.

### Proposed HTTP contract

Author these changes in `openapi.json` during implementation and regenerate `shared/api.ts`.

| Operation                                             | Purpose                                                                                                              |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `POST /api/attachments/{attachmentId}:import`         | Review an accessible attachment for relevant new and existing Things; return 202 with `importId` and status.         |
| `PUT /api/attachments/{id}/things/{thingId}`          | Retain the existing link route. Link to the owned Thing and enqueue supported attachment processing automatically.   |
| `GET /api/imports/{id}`                               | Return persisted import progress, per-subject outcomes, destination Thing IDs, warnings, errors and usage.           |
| `GET /api/imports/{id}/stream`                        | Send authenticated, revisioned import snapshots across all destinations, including progress before any Thing exists. |
| `GET /api/things/{thingId}/stream`                    | Retain progressive Thing updates, including attachment-processing progress and results.                              |
| `POST /api/imports/{id}:retry`                        | Resume eligible failures and unfinished destinations using saved extraction and checkpoints.                         |
| `POST /api/imports/{id}/subjects/{subjectId}:resolve` | Proposed owner decision for an ambiguous or additional subject: create, link to an owned Thing or dismiss.           |
| `POST /api/imports/{id}/subjects/{subjectId}:cancel`  | Proposed cancellation of queued or unfinished subject processing; preserve committed results.                        |

Attachment review considers all subjects. Linking specifies one destination and its processing scope. Persist that scope and trigger origin on the job so retries retain the intended operations. Link responses retain their current contract; progress is available through import and Thing projections. Repeated PUT requests reuse queued or completed processing.

Use existing `ImportStart`, `ImportAccepted` and `Import` components where their revised meanings fit. Results support several Thing IDs and per-destination status. Public snapshots include subject summaries sufficient for review, with raw extraction and private source content kept in protected persistence. Every read, stream and decision validates the authenticated owner.

### Extraction and identity

1. Validate attachment access and any linked destination. Persist the import and wake the runner. Create a Thing after identifying a relevant subject and resolving its destination.
2. Reuse valid attachment extraction or perform extraction once. Save document metadata, subjects, facts, page/quote provenance and coverage. Key validity by attachment content revision and extraction schema/prompt version; an existing link alone cannot establish extraction validity.
3. Evaluate each subject against owner-scoped Thing context. Manufacturer/model equality establishes product compatibility; matching an owned instance requires instance evidence. An ambiguous match becomes a subject awaiting an owner decision while other resolved subjects continue.
4. Persist destination allocation, source link and checkpoints atomically. Retries and concurrent submissions reuse the allocation. Recheck instance matches and owner scope before committing.
5. Select additional applicable field sets and map each destination progressively. Preserve selected sets, owner edits, explicit clears, sensitivity, per-set values and conflicting provenance. Reusing extraction still requires destination-specific relevance, selection and mapping.
6. Run resource discovery, suggested-task discovery and purchasable discovery for newly created Things. Processing a source added to an existing Thing runs extraction, field-set selection and mapping. Further research for an existing Thing remains an explicit operation.

Store extraction independently of the first import and destination. Private uploaded evidence retains its owner scope even when linked to several Things. Keep extraction validity separate from per-Thing application receipts, which identify the source revision, subject, destination and completed operations. Unlinking and relinking reuse receipts; changed extraction or explicit retries process only eligible unfinished work.

Supported uploads, library links and discovery-saved documents use the same scheduling path. Unsupported media or unavailable import configuration still permit linking. Discovery documents retain the existing applicability checks and cited enrichment path; a processing receipt coordinates this work with extraction/mapping so facts are applied once. Processing a discovered document has an enrichment scope that completes without scheduling another discovery round.

### Additional subjects and bulk progress

When a source is explicitly linked to a Thing, complete its relevant mapping independently of additional subjects. Persist other subjects with summaries, evidence references and possible owned-instance matches. Present them in an attachment/import review view where the owner can create, link or dismiss each. Compatible family-model mentions are reference context.

An unlinked multi-Thing source processes resolved relevant subjects automatically and exposes ambiguous subjects for review. The import view lists all subjects, their status and destination links; owners can open Things as they are populated and cancel unfinished subjects. Cancelled subjects stop before their next commit; committed Things and values remain available. Removing a created Thing is a separate owner action.

Per-subject results distinguish completed, awaiting decision, dismissed, cancelled and failed work. One destination failure preserves progress elsewhere. Aggregate status and retry eligibility reflect these results; pending owner decisions remain visible outside Thing-page progress and release processing locks. A no-relevant-Things result is distinct from an extraction failure or insufficient source coverage.

### Migration and delivery

Deliver in reviewable increments:

1. Persist reusable attachment extraction and per-destination receipts; add automatic processing for links to existing Things. Cover uploaded, library and discovery attachments.
2. Add attachment review initiation, persisted import streaming and delayed creation. Retain the Thing stream. Migrate upload, pasted-text and existing-attachment entry points together.
3. Add multi-subject allocation, owner resolution, bulk progress and per-subject cancellation.

Replace the import-wide `AWAITING_SELECTION` and confirmation payloads with per-subject resolution. Migrate saved extraction names, subject references, allocations and jobs consistently with `ExtractedThing`. Resolve persisted waiting jobs using recorded targets and the destination rules, preserving existing results and owner edits. Remove obsolete placeholders only after proving they are untouched and unreferenced. Retire `POST /api/things:import` with its callers in the coordinated contract release.

Release processing locks on terminal outcomes and while waiting for owner decisions. Reconnects and restarts restore persisted import and Thing progress. Source removal, unlinking and Thing deletion retain reference checks and prevent cancelled or removed destinations being repopulated by queued work.

Acceptance: every use case in the table has integration coverage; one source can populate several Things without duplicate creation on retry; adding another source to an existing Thing preserves edits and can add field sets; completed relinks avoid repeated AI calls; unrelated evidence leaves fields unchanged; bulk failures, decisions and cancellation survive reconnect and restart.

Issue scope:

- [#54](https://github.com/things-industries/boring-things/issues/54): automatic extraction/mapping on attachment linking and discovery-document processing.
- [#55](https://github.com/things-industries/boring-things/issues/55): remove the import-wide selection stall and migrate waiting jobs. Implementation requires aligning its single-Thing wording with attachment review and per-destination processing.
- [#56](https://github.com/things-industries/boring-things/issues/56): persist and review additional subjects outside the linked Thing's progress. Follow-up implementation issues can be prepared from these increments when issue creation is authorised.
- [#46](https://github.com/things-industries/boring-things/issues/46): multi-item allocation, filtering, bulk progress, destination navigation and cancellation.

## 7. Unowned reference attachments

Use attachments for verified public reference documents and images. Store discovered resources as attachments with nullable ownership and link the same attachment to Things belonging to different owners. User-uploaded sources retain their owner; shared eligibility requires verified public provenance and relevance.

Record source URL, content hash, document type, publisher, applicability evidence, language and version on the attachment. Search accessible unowned attachments before external retrieval. Verify applicability against the new Thing, including model variants, region, language and document revision. Deduplicate verified public content and preserve metadata and citations. Shared extraction can be reused; destination-specific selection, mapping and owner edits remain scoped to each Thing.

Example: a data-plate photo creates an oven Thing; discovery saves its public manual as an unowned attachment and links it. Another owner's receipt creates the same oven model; discovery finds and validates the saved manual, then links that attachment to the new Thing and enriches its missing fields.

Access and lifecycle:

- Keep blob access authenticated. Authorise owner uploads by ownership and unowned references through permitted discovery/library access or an owned Thing link.
- Filter attachment `thingIds` and all related Thing projections to the authenticated owner's Things, including detail, list, import and stream responses. Shared metadata contains public resource evidence only.
- Owner actions can unlink an unowned attachment from their own Things. Shared content and metadata updates are system-managed; owner-specific display preferences require owner-scoped storage.
- Deleting one Thing, link or account preserves references used elsewhere. Garbage collection checks all live links, jobs, citations and image references before removing an attachment or blob. Define retention for unlinked reusable public references.
- Migrate attachment ownership constraints, link ownership, access helpers, discovery persistence and blob lifetime checks together. Existing private attachments remain private; reuse across owners begins with resources verified for shared use.

Acceptance: the oven scenario reuses one attachment; both owners receive only their own associated Thing IDs; one owner's unlink/deletion preserves the other's access; private uploads remain isolated; shared references retain applicability evidence and authenticated access.

## 8. Latency, evaluations and provider experiments

Build a task baseline from existing usage logs and persisted task usage: extraction, identity matching, field-set selection, mapping, resource retrieval, reference extraction, task suggestions and purchasable discovery. Record model/provider, prompt/schema version, input size/pages, tokens, request count, retries, stage duration, total duration and measured or dated estimated task cost. Include tool and retrieval costs. Report median and tail latency, failure rates and reuse savings.

### Evaluation approach

- Maintain labelled, synthetic or redacted fixtures covering the use-case table, bulk quantities, duplicate instances, ambiguous matches, irrelevant attachments, family manuals, multilingual/long documents and conflicting owner values.
- Separate deterministic fixture checks from paid provider evaluations. Version datasets and expected outcomes; retain cited evidence and score errors by severity.
- Measure subject recall and precision, instance-match false positives, field-set selection, field precision/recall, unwanted custom fields, provenance, document applicability, retrieval success and suggestion compatibility. Unsafe instance merges and private-data exposure are release blockers.
- Compare candidate configurations on the same fixtures and full task, including validation, retries and fallback. Set quality thresholds and latency/cost targets before selecting a configuration. Keep a held-out dataset for the adoption decision.
- Paid evaluations remain opt-in and require owner approval for each invocation under [metered AI validation](../agents/agent-behaviour.md#metered-ai-validation). Default CI uses mocks and fixtures.

### Per-task model and provider selection

Choose configurations by task results. Evaluate smaller/faster models for bounded extraction, field selection and mapping; evaluate identity and research tasks against their own evidence and quality needs. Configure task-specific models behind existing application/provider boundaries, with bounded fallback policies, checkpoint reuse and observable routing. Record fallback cost and latency in the comparison.

Experiment with Jev for bounded decisions over extracted evidence, Firecrawl for retrieval and other providers where baseline measurements identify an opportunity. These are evaluation candidates; adoption requires an approved provider/infrastructure decision. Assess schema compatibility, source citations, privacy, retention, regional availability and operational failure handling alongside quality, latency and cost. Keep raw private sources and instance-specific values within their authorised processing scope.

Measure whether a separate identification pass reduces time to the first Thing or duplicates extraction cost. Persist source coverage and truncation; opening-page scans of long documents cannot establish all subjects. Partial coverage exposes unresolved source regions and permits continued extraction without presenting the subject list as complete. Compare single-pass extraction, page-aware batches and cached extraction reuse.

[Research references](../requirements/research/sources.md#import-provider-evaluation--4-october-2026) contain starting sources for experiments. Verify current provider capabilities and pricing when running comparisons. Record reproducible configurations, scores, latency, cost and the adoption recommendation in [import evaluations](../requirements/research/import-evaluations.md).

## Validation

- Stage 3: use-case matrix, extraction reuse/invalidation, owner scope, idempotent allocation/linking, field-set additions, provenance, partial failures, additional-subject decisions, bulk cancellation, migrations, reconnect and restart. Browser coverage includes progress before creation and navigation across destinations.
- Stage 7: shared attachment access, filtered Thing associations, public applicability, private-source isolation, deletion/reference lifetimes and extraction reuse across owners.
- Stage 8: labelled offline checks and approved provider runs with quality, latency and full-task cost comparisons.
- Follow [repository validation](../../README.md#validation). Maintain [product requirements](../requirements/product/PRODUCT.md) and the [import guide](../setup/imports.md) as behaviour is delivered. These stages describe planned capabilities.
