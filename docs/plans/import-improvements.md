# Single-Thing Import implementation

Status: implemented on `feature/attachment-transcription-import-intent`. Fixture and mocked-provider validation covers the workflow; live model and provider evaluation remains opt-in.

[Andrew's Import requirements](andrew-import-reqs.md) define the intended behaviour. This plan turns those requirements into implementation stages. [Product requirements](../requirements/product/PRODUCT.md) describe the product, and the [import guide](../setup/imports.md) describes delivered behaviour.

## Delivery scope

Each Import processes one Thing. An open Import selects the strongest Thing Candidate; an Import with Thing context uses that Thing and accepts ambiguous source material unless its identifiers contradict the target. Input Attachments may be grouped. Each stage operates on the selected Thing.

Manual creation saves a Thing directly. The owner can explicitly start an Import or Recommendation for that Thing. An Import with Thing context and zero Attachments begins at Research. With neither context nor Attachments, it completes without work. Recommendation runs at the end of an Import and can also run independently.

Identifier matching initially uses an AI semantic judgement over category-valid identifier fields and owner-scoped existing Things. The accepted limitations in the requirements apply. Later scope includes processing several Things in one Import, candidate-choice controls, field-specific comparison functions and evidence-precedence policies. Implementation and validation in this delivery cover the single-Thing workflow.

## Implementation map

| Capability                                    | Modules                                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Concurrent runner and leadership              | `application/jobs/runner.ts`, `db/job-lease.ts`, `app.ts`                                                          |
| Attachment transcription and shared resources | `application/import/transcription.ts`, `application/import/resources.ts`, `db/entities/attachments.ts`             |
| Single-Thing workflow and checkpoints         | `application/import/workflow.ts`, `application/import/processor.ts`, `db/entities/imports.ts`                      |
| Field occurrences and automatic writes        | `application/thing-fields.ts`, `application/thing-data.ts`, `db/entities/thing-fields.ts`, `db/entities/things.ts` |
| Identifier roles and mandatory fieldsets      | `db/seeds/registry.ts`, `application/registry/`                                                                    |
| Typed AI task foundation                      | `providers/ai/tasks/task.ts`, task modules in `providers/ai/tasks/`                                                |
| Initial specialist provider                   | `application/import/specialists.ts`                                                                                |
| Manual Import and Recommendation actions      | `routes/imports.ts`, frontend Imports service and Things store/page                                                |

Server paths above are relative to `server/src/`. Field-directed population replaces the application fact-mapping and separate discovered-document population paths. Standalone provider extraction helpers remain for opt-in evaluations.

`20261013230037_import_workflow.sql` replaces obsolete demo field values and Import history, adds `bt.thing_fields`, and permits shared public Attachments. The preceding source migration removes unfinished legacy demo jobs so the upgrade can proceed. Apply `pnpm db:migrate` and `pnpm db:seed` before starting the revised app. Upgrade validation includes unfinished legacy Imports and checks that Things, Attachments, transcribed text and attachment links are retained.

## Data model and field writes

### Thing Fields

Store each field occurrence in `bt.thing_fields`, including empty occurrences. A row records its Thing, optional registry definition and fieldset, optional value, automatic-population setting, origin and source references. Custom fields retain their local definition metadata. Keep selected fieldsets, pins and other Thing metadata associated with the Thing.

Registry field occurrences retain their fieldset context. Reused definitions in different contexts have independent values. Standalone and custom fields have no fieldset. Values can remain JSON to represent the registry's existing types. Missing values remain distinct from `false`, `0` and empty strings.

Empty registry fields introduced by either automatic or manual fieldset addition start with automatic population enabled. Imported fields also start enabled. Manually entered values and manually created custom fields start disabled. Editing a value or requesting that its value be removed disables automatic population. Removing a value retains its field occurrence and disabled setting.

Provide one application capability for field creation and writes. It validates owner scope, field membership, schemas, sensitivity and provenance. Automatic identifier, specialist-provider and population writes all use it. Before committing, recheck the current field and its permission under a transaction. Protected values remain unchanged and conflicting proposals do not create duplicate fields.

Commit field changes and the corresponding Import checkpoint together. Publish progress after the commit. Replace field-specific `userEdited` markers with the persisted field setting; retain owner decisions concerning fieldsets, pins, names and image selection.

### Registry and mandatory identifiers

Field definitions classify identifiers as group, class, instance or non-identifier. Keep sensitivity and public-research eligibility independent of that classification.

A fieldset with null eligibility is mandatory for its category. Every category has at least one mandatory fieldset. Ensure those fieldsets exist on Things created manually or through an Import.

Place the identifier fields used for candidate resolution and initial specialist lookups in mandatory fieldsets. Include essential lookup context, such as registration jurisdiction, there as well. Each identifier has a designated occurrence in a mandatory fieldset for its category. Adjust optional fieldsets to avoid adding another occurrence for the same identity data. Save identifiers into these fields before Research; optional fieldset selection then adds other relevant fields.

Validate this registry arrangement in seed and registry checks. Candidate identifiers must refer to recognised identifier fields available for their category. A fieldset is included once, and existing include/dependency validation remains in place.

### Attachments and Imports

An Attachment owns original content, page-labelled transcription, summary, terms, identifier observations and processing status. Identifier observations preserve raw string values, printed labels where available and Attachment/page/passage evidence. The Import assigns registry meaning and associates observations with its selected Thing Candidate.

An Import owns its sources, optional Thing context, selected candidate, resolved Thing, current stage, usage, warnings and completion records. Persist completed identifier writes, provider results, resources, population batches, additional-information batches and recommendation outcomes. The selected Thing ID survives retries.

## Process flow

1. **Transcribe submitted Attachments.** Extract readable English text and image descriptions, a bounded summary, terms and possible identifiers. Reuse saved transcription. Preserve original pages and evidence references. Distinguish completed, partial, empty, insufficient-English and failed outcomes.
2. **Resolve one Thing.** Use summaries, terms, identifier observations, category/identifier definitions and optional Thing context. Provide bounded transcription search for additional evidence. Select the context candidate or strongest open candidate, then match an owner-scoped Thing or create one. Unidentifiable open input and contradictory contextual input produce explained errors. Context permits identifier-free scraps to contribute to its Thing.
3. **Save identity.** Ensure mandatory fieldsets exist, save eligible candidate identifiers for created or matched Things, and link relevant input Attachments. Commit the selected Thing and identity checkpoint together.
4. **Research.** Query applicable specialist providers from saved fields and commit eligible results immediately. Search saved public Attachments before document APIs or web retrieval. Save or reuse applicable resources, link them to the Thing and current Import, and await their transcription outcomes. Failed optional resource processing adds a warning; continue with available evidence.
5. **Select fieldsets.** Review the selected Thing and summaries/terms from all its applicable linked Attachments. Add eligible fieldsets and their missing field occurrences, respecting owner decisions about removed optional sets.
6. **Populate fields.** Search applicable Attachment passages for fields with automatic population enabled. Validate and commit proposed values in bounded batches through the shared field writer. Use the same population capability for uploads and discovered resources.
7. **Find important additional information.** Review owner-uploaded source content in bounded batches. Add significant information to a matching standalone registry field, or to a custom field when justified. Retain incidental content in the transcription. Use a configurable lower-cost model and a high threshold for custom fields.
8. **Recommend.** Run the Recommendation capability using committed fields, applicable Attachment content and category hints. Save cited management tasks and purchasables while preserving existing suggestions and owner decisions.

Zero-Attachment contextual Imports enter step 4 with the Thing's existing fields. Direct Recommendation starts step 8. Public research receives eligible public fields; private identifiers are used only by an applicable specialist lookup with validated inputs. Source content and model results remain untrusted inputs.

## Task and provider boundaries

### AI tasks

The `AiTask` foundation owns buffered and streamed SDK requests, structured-output validation, bounded tool conversations, cancellation and usage reporting. Task instances hold only state needed for their execution.

Each task owns its prompt, response schema, permitted tool adapters and response conversion: transcription, candidate resolution, fieldset selection, population, additional information, resource research and recommendations. Task schemas are authored with their classes independently of the external HTTP contract. Shared fragments cover repeated shapes; shared prompt text and tool adapters remain in their AI provider modules. Generate model-output types through `pnpm ai:generate` and keep them inside the provider boundary. Application interfaces define domain inputs and results.

The application workflow owns access checks, database transactions, progress checkpoints and recovery. Tasks return validated batches or use an awaited commit callback. Successful commits precede completion records and progress events. Reuse `ApplicationEvents` for notifications.

Transcription search provides bounded passages or pages from the saved Attachment. Registry search continues to restrict returned definitions to the relevant category and allowed field scope. Full-document review uses batches so large sources remain usable within request limits.

### Specialist providers

Use a shared typed provider contract declaring required fields, applicability and a lookup returning mapped registry fields/fieldsets with provenance. Keep HTTP, credentials and external response validation inside each provider implementation. A small coordinator selects applicable providers from the saved Thing fields.

Each provider result is validated and saved through the shared field writer before later research or Recommendation reads it. Persist provider/lookup provenance, usage and completion together with the accepted changes. Retries reuse completed results. Optional lookup failures retain a warning and allow the workflow to continue.

The initial provider uses Icecat Product JSON with `ICECAT_ACCESS_TOKEN`. Appliances and devices trigger lookup from `common.gtin`, or from `common.manufacturer` plus `appliances.productCode` (preferred) or `common.model`. Returned identifiers must match. Free Open Icecat access covers participating manufacturers; catalogue absence and publication/subscription restrictions yield no proposals. Recognised product specifications map by Icecat feature ID into category-valid fields through the shared writer. Provider tests use synthetic responses.

### Concurrent runner

Extend the existing runner with independent Import, Attachment-transcription and assistant loops, initially one active job per processor. Each loop continues claiming work while another processor awaits external work or transcription. A waiting Import therefore leaves transcription capacity available.

Acquire the existing database session lock and complete recovery before starting the loops. Abort and await every active job before releasing leadership during shutdown. Preserve the existing response to lock loss. Share the execution lifecycle within the runner and keep processor-specific work behind its existing contract.

Imports wait against persisted Attachment outcomes with cancellation and time limits. Save their stage and resource references before waiting. Recovery resumes from those records. Use the existing runner for this delivery; additional scheduling dependencies can be evaluated if they replace necessary scheduling code.

## Shared public Attachments

Save verified public documents and images once with null ownership and a source URL. Reuse their transcription, public metadata and registry-linked identifier coverage. Keep Thing-specific interpretations and preferences with the owner-scoped link or Import.

- Private uploads remain owner-scoped. Shared resources are accessible through permitted research or the owner's Thing links.
- Validate both sides of every link. Responses and streams expose only the authenticated owner's associated Things.
- Shared content and metadata are system-managed. Owner-specific preferences belong to the Thing Attachment relationship.
- Unlinking affects the owner's relationship. Physical deletion checks Thing links, Imports, citations and image selections and preserves resources referenced elsewhere.
- Coordinate nullable Attachment ownership, link authorisation, Import source access, transcription claims and blob lifetime checks. Source URL alone does not grant shared access.

Resource applicability and cited field values still require evidence relating them to the selected Thing. Reuse public-field selection and resource-download validation. Preserve owner image choices when selecting a discovered photograph.

## Progress, recovery and limits

Persist source outcomes, stage, selected candidate, resolved Thing, warnings, errors and request/token/time usage. Owners can leave and return to processing. Transcription jobs complete independently of Imports.

Commit related application changes and checkpoints atomically. A retry resumes unfinished work and reuses saved Thing allocation, provider queries, resource outcomes, field batches and recommendations. Fresh explicit Import or Recommendation requests start new work for the existing Thing.

Persist a manual Recommendation request in the existing Import job storage with a Recommendation entrypoint. The Import processor runs that entrypoint directly and records its usage, warnings and outcomes through the same lifecycle. API and progress responses identify the requested operation as Recommendation. This keeps standalone Recommendation within the existing scheduling capability.

Research and Recommendation failures produce retryable warnings while retaining completed work. Identity failures produce explained errors. Persistence failure prevents the affected operation being marked complete. Processing restrictions end on completion or error.

Configure limits for upload count/size, downloaded resources, per-request text, provider/model requests and elapsed time. Process large documents in batches. A limit retains saved results and reports unfinished work.

Restart recovers persisted work. Unlinking or deleting a target prevents unfinished work from restoring removed relationships. Transcription replacement invalidates unfinished dependent work while preserving committed Thing identities, owner decisions and values.

## HTTP and frontend integration

Author contracts in `openapi.json`, then regenerate `shared/api.ts`. AI schemas are authored with task classes in `server/src/providers/ai/tasks/`, independently of the HTTP contract; generated internal types are checked separately.

| Capability            | Contract work                                                                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start Import          | Extend `POST /api/imports` to accept zero Attachments with Thing context and the no-work case. Retain owner validation and grouped Attachment submission. |
| Observe Import        | Expose the selected Thing, stage, source/resource outcomes, warnings and usage through the existing Import detail and stream routes.                      |
| Retry                 | Resume saved unfinished work through the existing retry route.                                                                                            |
| Manual Recommendation | Add an owner-scoped operation that starts the same persisted Recommendation capability used by Imports.                                                   |
| Thing fields          | Expose automatic-population settings and empty field occurrences through the existing field response structure where practical.                           |
| Shared Attachments    | Update access and relationship responses for unowned public resources while retaining private upload protection.                                          |

Retain the existing Import page, store, source-status display and navigation to the resolved Thing. Make frontend changes required for contract compatibility and the explicit Import/Recommendation actions. Update stage labels as behaviour is delivered. Manual Thing creation remains a direct operation.

## Delivered stages

The six stages include their contracts, documentation and focused checks.

1. **Runner concurrency.** Retain processor interfaces and leadership protection; introduce independent loops. Verify that transcription queued by a waiting Import runs, each processor remains serial, and shutdown waits for all jobs.
2. **Thing Fields and registry.** Add `bt.thing_fields`, empty-field permissions, shared writes, identifier roles and mandatory identifier fieldsets. Update manual editing, projections, public-field selection, seeds and contracts. Remove replaced field storage/edit markers.
3. **Task foundation and single-Thing processing.** Introduce the shared AI execution foundation; save Attachment identifier observations and implement selected-candidate resolution, matching and identity writes. Add fieldset selection and the shared population task for uploaded Attachments. Replace generic targeted fact extraction, fact-disposition batches and multiple-target orchestration. Begin with deterministic source/provider fixtures.
4. **Shared resources and common population.** Implement public Attachment ownership/access, reusable resource transcription and the Research → fieldset selection → population order. Replace discovered-document value extraction with the same population task used for uploads. Retain source validation and optional-failure behaviour.
5. **Specialist lookup.** Add the typed provider contract, coordinator and initial Icecat lookup inside Research. Verify required-input applicability and saved-field handoff to later research. Add further providers when their access and mapping are established.
6. **Recommendation and completion.** Make Recommendation independently invokable and use it at Import completion. Add manual actions and zero-Attachment Imports. Complete stage recovery, bounded additional-information review, lifecycle and usage reporting, then remove remaining superseded helpers, contracts and fixtures.

Stages 4 and 5 feed Research before fieldset selection and population. The common task and field writer own validation and commit permissions across stages.

## Validation

Use small synthetic sources, controlled providers and deterministic time where necessary. Extend existing checks for retained behaviour and place new checks in a dedicated `tests/` directory; update test discovery when adding that directory.

- Verify single-Thing creation and augmentation, contextual scraps, nonsense input, contradictory context and cited identity writes before Research.
- Verify mandatory identifier membership, strings with leading zeroes, independent fieldset contexts and preservation of `false`, `0` and empty text.
- Verify empty manually added registry fields can be populated, entered/removed values stay protected, every automatic writer rechecks permissions, and field changes/checkpoints commit together.
- Verify one population capability consumes uploaded and discovered Attachments, with bounded retrieval, schema/citation checks, additional information and reusable completed batches.
- Verify independent runner progress, transcription success/failure, shutdown, leadership transfer, interruption and saved-work recovery.
- Verify shared public reuse across owners, filtered relationships, private-source isolation and reference-aware unlink/delete behaviour.
- Verify specialist applicability, mapped-field provenance, retry reuse and later stages consuming committed fields.
- Verify manual creation, contextual zero-Attachment Imports, independent Recommendation, optional warnings and progressive Import navigation.

Run repository formatting/spelling, generated-contract checks, lint, types and unit tests. Add database and browser checks for the changed persistence, access and user journeys. Default checks use fixture providers. Metered AI checks require approval for each invocation under [agent guidance](../agents/agent-behaviour.md#metered-ai-validation).

Update the [import guide](../setup/imports.md), backend conventions, product requirements and README as behaviour is delivered. Record measured accuracy, cost and latency in [import evaluations](../requirements/research/import-evaluations.md).

Validation completed on 2026-10-14: `CI=true pnpm check` passed 111 unit tests and the production build; `pnpm test:integration` passed 38 checks; the Add Thing browser suite passed 14 mobile/desktop checks, including manual Import and Recommendation. Live OpenAI and specialist requests were not invoked in that validation run.
