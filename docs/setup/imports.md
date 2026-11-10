# Import process

Imports resolve one Thing from uploaded evidence, save its identifiers, research public resources and specialised data, select fieldsets, populate fields and recommend tasks and products. Fastify owns validation and persistence. Model tasks propose information and include sources when available. Citation matching is optional; useful proposals can be saved with no citations.

## Entry points

- Uploads start Attachment transcription independently. Plain text is decoded directly. PDFs use local text extraction per page; pages without text are rendered locally and read by Google Vision OCR, as are uploaded images. The `summarize-attachment` AI task receives only the resulting text and returns summary, terms, identifier observations, display metadata and language/readability status. Attachment processing commits extracted text before model analysis. Analysis failure leaves the text available with `PARTIAL` status. Invalid metadata properties are omitted independently, and language assessment keeps the extracted text. Missing credentials or OCR errors fail transcription; sources without recognised text finish as empty. `POST /api/imports` accepts up to ten Attachment IDs and optional Thing context. The Import waits for submitted sources to finish or fail, then uses readable sources.
- Thing context supplies the target for ambiguous scraps. Contradictory identity evidence produces `wrong_thing`. An open Import without an identifiable Thing produces `no_thing_identified`.
- The strongest candidate is selected and matched semantically against the owner's existing Things. Only one Thing is processed.
- **Find more details** submits an Import with Thing context and no new Attachments. It starts at Research and uses existing linked content during population.
- **Refresh recommendations** calls `POST /api/things/{thingId}:recommend`. It runs the same Recommendation capability that finishes Imports.
- Manual creation saves a Thing directly. Empty Import input without a Thing completes without work.

## Workflow

[ImportWorkflow](../../server/src/application/import/workflow.ts) persists the following stages:

1. **Identify.** Extracted source text is reviewed in bounded summary requests while the complete text is saved separately. Use source summaries, terms, possible printed identifiers and bounded transcription searches. Validate the category, owned match and source citations. Create or match the Thing, add mandatory fieldsets, save identifiers and link relevant sources in one transaction.
2. **Research.** Applicable specialist providers return registry field and fieldset proposals. Each provider's accepted changes and completion checkpoint are saved before public research. Icecat is enabled by `ICECAT_ACCESS_TOKEN`. For appliances and devices, `common.gtin` triggers a GTIN lookup; otherwise `common.manufacturer` plus `appliances.productCode` or `common.model` triggers a brand/product-code lookup. Product code takes precedence over model. Serial numbers and manufacturer alone do not trigger it. Returned GTIN or brand/product-code identity must match before fields are saved.
3. **Find resources.** Reuse shared Attachments with registry-linked class coverage, then search public sources using eligible public fields and category hints. Include the name resolved from submitted sources so model years and generations remain available during resource and recommendation research. Requests without submitted sources use public fields. Resource selection may suggest a display name for the existing Thing. Apply that suggestion to a newly imported Thing unless the owner has edited its name; field selection and recommendations use the updated name. Download proposed PDFs and images through the existing protected retrieval helpers, using an application User-Agent for sites that reject requests without one. Save them as unowned public Attachments, link them to the Thing and Import, and await independent transcription for documents. Product photographs skip transcription and field/recommendation evidence, including photographs saved by earlier imports. Assess document applicability and save group/class identifier coverage for reuse.
4. **Select fieldsets.** Review applicable linked-source summaries and terms. Validate selections against existing category fieldsets and materialise empty field occurrences.
5. **Populate.** Search saved transcriptions for enabled field targets in batches of twenty. Validate field membership and value schemas; omit mismatched quotations and page references. Public resources supply class data. Read the current Thing under a row lock and recheck its population permissions and cited source links before saving each batch.
6. **Additional information.** Review private uploaded text in batches of 20,000 characters using its task model. Keep only significant information about identifying, operating, maintaining or administering the Thing. Search registry fields before proposing custom fields. Reuse existing occurrences and preserve protected values. Invalid findings are omitted individually; task failures produce retryable warnings while recommendations continue.
7. **Recommend.** One management-task AI task and one purchasable AI task run in parallel. Each reads applicable linked Attachment passages and saved Thing fields, then uses web search when evidence or purchase links are missing. Recommendations may cite Attachment passages, public sources or both. Purchase URLs must be usable HTTP(S) links. Web tool-call budgets apply across the whole task conversation. Usage snapshots and result commits run in sequence; retry reuses each completed operation. Save suggestions without replacing existing owner decisions. Intervals remain descriptive; scheduling belongs to the owner.

[AI tasks](../../server/src/providers/ai/tasks/task.ts) share SDK execution for buffered and streamed responses, conversation history, validated structured outputs, typed tools, cancellation and usage reporting. The base class receives execution resources at construction, constructs the SDK client and wraps the parameterless `runTask()` implementation with a typed, parameterless `run()` method. Every task receives its inputs through its constructor. Tasks register a completion callback with `onTurnCompleted()`; awaited usage persistence stays in the execution context. Each task module defines its task-specific inputs and model outputs beside its prompt, output schema and result conversion. Application modules define domain return types, which tasks import and return. Shared domain types stay in application modules.

Each task owns its model selection. Thing-oriented tasks include the shared Thing definition in their instructions; attachment summaries and delegated public research use their own evidence rules. Document extraction receives the subject name, and both recommendation tasks receive field labels, descriptions and validation schemas alongside values. Each task owns its instructions; shared recommendation and resource instructions stay with those capabilities. Definitions and evidence rules shared across capabilities are Markdown files in `providers/ai/prompt-content/`, loaded by `providers/ai/prompts.ts` and composed by tasks; import read tools stay in `providers/ai/tools/` and own their execution, call limits and usage recording. Callers pass inputs and an `ImportTaskContext` to task constructors. The context contains authorised source text, category, retrieval records and tool budgets alongside job execution resources. `AiContext` contains the job cancellation signal, an optional `beforeRequest` callback that consumes the shared model-request allowance across tasks and retries, and an awaited `record` callback for usage persistence. Text limits are class settings on `AiTask`, overridable by tasks. The context itself is not included in prompts; source reads return bounded passages. Database and registry resources are bound when the provider is assembled. Task schemas are independent of the HTTP OpenAPI contract. Task outputs and tool arguments use `FromSchema` from `json-schema-to-ts` to infer types from their authored schemas during type checking. The object-schema helper preserves literal types and marks every declared property required. Shared schema fragments use `as const`; model responses and tool arguments still pass through AJV validation at runtime. The application awaits every proposed write. Authenticated revisioned Import and Thing SSE snapshots expose progress without raw source text.

Source-evidence comparisons trim and collapse whitespace on both sides. Extracted text keeps its original formatting. An identifier observation, field proposal, coverage claim, additional finding or source-based suggestion with a mismatched quote or invalid page is skipped individually; other source content continues through the workflow. Extracted identifier labels, values and saved quotes also use trimmed, collapsed whitespace.

## Suggested tasks

Task suggestions prioritise activities specific to the Thing that help maintain it and are easy to forget, such as running a maintenance programme, using pyrolytic cleaning, replacing a consumable or booking a service. They include recurring work and relevant one-off administration. Extremely obvious actions, work likely to happen very frequently during normal use, passive waiting and rare incident recovery are excluded. Common remedies that nearly every owner is likely to need, such as resetting a router, can qualify without a recorded fault; descriptions explain when to use them and their consequences. Boring Things handles importing identifiers, policy details and documents.

Supplied age, mileage, condition and service history guide selection of applicable work, such as the documented car service for its age and mileage. Missing facts remain unknown; descriptions give documented conditions without assuming work is due. Prompts ask for evidence recommending the action for the Thing and relevant component when available. Warnings, chemical mentions and identifying labels alone do not justify maintenance tasks.

Titles name the procedure or outcome with a verb and object, such as **Use the pyrolytic cleaning function**. Frequency, conditions, preparation, precautions and completion steps belong in descriptions. Removing coarse dirt belongs in the pyrolytic cleaning description; removing food residues during normal oven use is routine care. Suggestions represent each underlying action once. Task recommendations compare supplied existing tasks by meaning, including completed and dismissed tasks. Both recommendation tasks receive linked Attachment summaries, field definitions and values, eligible public research fields and existing suggestions. Their tools may read private evidence and search the public web in the same conversation. Prompts direct web queries to public model, provider and product details. Application checks exclude matching existing titles.

## Validation and omitted results

Imports favour useful information despite incomplete citations. Public recommendation and resource URLs do not need to match search results. Attachment citations must refer to an authorised source; quotations or page references that fail matching are omitted while the proposed information is saved. Recommendations allow empty source lists. A product requires a usable HTTP(S) purchase link; a rejected link omits that product. Downloads continue to enforce address, DNS, content and size restrictions.

Model response arrays are validated one member at a time. Existing registry IDs and category membership govern field selection; prior retrieval through a search tool is optional. Invalid field values, duplicate proposals, unrequested fields and pins are omitted. Public sources supply only `GROUP` and `CLASS` fields. Ownership, user edits, field types and transaction failures continue to govern writes. Applicability assessment errors leave public documents available for subsequent tasks; an explicit inapplicability result excludes them.

Completed imports show that optional work was omitted when a stage has a retryable warning. Skipping an invalid individual proposal completes that batch; a new import can revisit it. Retries resume unfinished operations.

## Fields and owner decisions

`bt.thing_fields` stores values, occurrence addresses, provenance and `auto_populate`. Thing metadata retains fieldset selection, pins and owner decisions. API responses project field occurrences into fieldsets, standalone fields and custom fields.

Field definitions classify attributes by `scope`: `GROUP` for manufacturer/provider attributes, `CLASS` for model/plan attributes, and `INSTANCE` for the owned item, account or agreement. `isIdentifier` marks fields that contribute to Thing identification. Public research uses populated `GROUP` and `CLASS` fields independently of sensitivity. Purchase date, price paid and order reference are `INSTANCE` attributes without an identity role. Custom fields use the same scopes and default to `INSTANCE`; they do not participate in identity matching.

Mandatory fieldsets have null eligibility. Category identifiers have a mandatory occurrence before research. Empty registry fields added manually remain eligible for population. Imported fields are eligible. Manual values and custom fields disable automatic population; manually clearing a registry value retains an empty disabled occurrence. A `ValuePatch` can change `autoPopulate` alone while retaining the value and provenance. Every automatic writer uses the same permission check.

Changing category or removing a populated fieldset preserves values, sensitivity, provenance and pins through custom fields. Owner-removed fieldsets, custom fields and Attachment links are recorded so automatic work cannot restore them.

## Shared resources and access

User uploads remain private. Discovered public resources are saved once with unowned content, transcription, public metadata and identifier coverage. Owner-scoped Thing links control associations. Attachment responses list only the requesting owner's Things. Import and citation references also retain access to public evidence after unlinking.

Owners may unlink shared resources. Shared metadata and content are system-managed; owners cannot change or physically delete them. Private Attachment deletion is rejected while a Thing, Import or citation still references it. Deleting a Thing removes its job and links while retaining shared files.

## Execution and recovery

[JobRunner](../../server/src/application/jobs/runner.ts) runs Import/Recommendation, transcription and chat processors concurrently. Each processor handles one job at a time. A PostgreSQL session lock permits one runner per database; recovery runs after acquiring leadership, and shutdown awaits all processors before releasing it.

Identity, specialist results, resources, field batches and recommendations have saved checkpoints. Application changes and completion records share a transaction. Restart requeues interrupted work. Retry reuses completed work, requeues failed source transcription and resumes unfinished stages. Source fingerprints make changed transcription or links eligible for renewed field work, and commit-time checks skip proposals citing changed or removed sources. Unrelated proposals continue.

Identity failures become explained errors. Failed Imports save the stage and a bounded failure reason in the internal workflow checkpoint; retry removes that failure record. Optional research and recommendation failures retain retryable warnings and saved results. Invalid individual proposals, field IDs and pins are omitted while valid peers continue. Optional fieldset-selection and population failures create retryable warnings and allow subsequent stages to run. Persistence failure prevents a completion checkpoint. Completion and errors release processing restrictions. The frontend shows unfinished work and offers retry, including completed jobs with warnings.

## AI task configuration

Provider log task names follow task filenames using underscores. `find-resources.ts` logs its requests as `find_resources_search` and `find_resources_selection`; `assistant-research.ts` logs delegated chat research as `assistant_research`.

Each task declares its model and reasoning effort in `server/src/providers/ai/tasks/`. The base task sets standard reasoning mode for every request. The base task reads `OPENAI_API_KEY` through `getEnv` at construction and sets limits. Task classes override shared limits where needed; each research task sets its web search limit to three calls. Application configuration controls workflow budgets and deadlines. Provider assembly rejects missing credentials at startup. Task model choices apply to imports, recommendations and chat.

| Task                                  | Model         | Reasoning effort |
| ------------------------------------- | ------------- | ---------------- |
| Attachment summary                    | `gpt-6-luna`  | `low`            |
| Thing resolution                      | `gpt-6.1-sol` | `medium`         |
| Fieldset selection                    | `gpt-6-luna`  | `low`            |
| Resource applicability                | `gpt-6.1-sol` | `medium`         |
| Field population                      | `gpt-6-luna`  | `low`            |
| Additional information                | `gpt-6.1-sol` | `low`            |
| Resource search                       | `gpt-6.1-sol` | `medium`         |
| Resource selection                    | `gpt-6-luna`  | `none`           |
| Task suggestions                      | `gpt-6-luna`  | `low`            |
| Purchasable suggestions               | `gpt-6.1-sol` | `medium`         |
| Assistant public research             | `gpt-6.1-sol` | `low`            |
| Assistant responses                   | `gpt-6.1-sol` | `low`            |
| Source extraction evaluation helper   | `gpt-6-luna`  | `low`            |
| Document extraction evaluation helper | `gpt-6-luna`  | `low`            |

Image and scanned PDF page OCR uses Google Vision `DOCUMENT_TEXT_DETECTION` before `summarize-attachment`. Model quality for the current workflow requires the opt-in evaluations; fixture tests verify request settings and application behaviour.

## Limits and configuration

Set `GOOGLE_VISION_API_KEY` for images and PDF pages requiring OCR, enable Cloud Vision API and billing in its Google Cloud project, and restrict the key to that API. Restart the API after changing environment variables. The `providers/google-vision` module calls `DOCUMENT_TEXT_DETECTION` through REST with the credential in a request header. Original files stay in attachment storage. PDF parsing and rendering run in a worker with a 256 MB heap limit. Pages without embedded text are rendered at up to twice their PDF dimensions, capped at four million pixels, and sent through the image OCR endpoint one page at a time. Combined text keeps original `[PDF page N]` labels and is bounded to 1,000,000 characters. Request copies above 7 MB are encoded as JPEG at the original dimensions first, then resized once if needed to fit Google's 10 MB JSON request limit; copies still above the limit fail. Each OCR request has a 30-second deadline within the attachment's existing deadline. The 15-second parsing deadline pauses during OCR and restarts when parsing resumes. No SDK or additional storage service is required.

Google Vision completion logs contain elapsed time and image count under `metrics`. Attachment usage records the OCR operation as `google_vision_ocr` without treating it as model token usage. Automated fixture tests substitute OCR text and never call Google.

| Work                        | Limit                                                                        |
| --------------------------- | ---------------------------------------------------------------------------- |
| Submitted Attachments       | Ten per Import                                                               |
| Linked-source review        | Twenty per run; additional sources produce a warning                         |
| Resource discovery          | `IMPORT_MAX_RESOURCES`, default three                                        |
| Source transcription        | 1,000,000 text characters; original page labels retained                     |
| Model conversation text     | 120,000 characters in the base AI task                                       |
| Model response output       | 12,000 tokens in the base AI task                                            |
| Model requests              | `IMPORT_MAX_REQUESTS`, default sixty per Import or Attachment across retries |
| Local tool calls            | `IMPORT_TOOL_ROUNDS`, default four per task or batch                         |
| Field population            | Twenty requested fields per batch                                            |
| Additional information      | 20,000 source characters per batch                                           |
| Import attempt              | `IMPORT_TIMEOUT_MS`, default 180,000 ms                                      |
| Resource transcription wait | `DISCOVERY_TIMEOUT_MS`, default 90,000 ms                                    |
| Public web search           | Three calls per research operation, set in each task class                   |

Upload size, PDF parsing and image decoding also use the limits in the retrieval helpers. Request entries record model, token usage and latency; Import usage includes source transcription usage and records tool calls and elapsed time. When a local tool-call limit is reached, the task disables further tools and requests a final answer using the evidence already gathered. Request, text and timeout limits still apply. Other limit failures keep committed work for review or retry with revised configuration.

Icecat uses the [Product JSON API](https://iceclog.com/manual-for-icecat-json-product-requests/) with the token in the `api-token` header. Free Open Icecat access covers participating brands such as Philips; absent, restricted and unreleased products return no proposals. Authentication, transport and malformed-response failures create retryable warnings. No brand list is hard-coded. Mapped fields include manufacturer, model, GTIN, unqualified overall dimensions, appliance finish and electrical supply, and device weight, screen diagonal and display resolution when supplied. Feature IDs select meanings and display values keep units; package and stand-specific dimensions are omitted. The shared writer applies owner permissions. Run `pnpm db:seed` and restart the API after updating the registry. No provider credentials reach the browser.

### Vehicle lookup

[Zyfy](https://zyfy.uk/docs/vehicle) runs before public resource research when `ZYFY_API_KEY` is configured and the saved Thing has a registration and a UK registration country. Accepted country values include UK, GB, GBR, United Kingdom, Great Britain and the constituent countries. The provider checks that the returned registration matches the normalised lookup input.

Vehicle fields include manufacturer, model, body type, colour and year of manufacture. Manufacture year is separate from model year. `vehicles.firstRegistered` stores the first-registration month as `YYYY-MM`; a migration converts existing full-date values and keeps provenance and owner permissions. The field uses a text editor with month validation.

Road vehicle specifications include fuel type, CO2 emissions and London ULEZ compliance. Combustion engine specifications include engine capacity and emission standard. Roadworthiness stores the MOT scheme, status, expiry, first test due date and last recorded test date/result. Road tax stores status, due date and annual cost using GBP minor units. Maintenance includes an outstanding safety recall flag. Unknown values remain unset; false and zero remain values. The shared writer respects owner edits and disabled population.

Pending enrichment follows `Retry-After`, with at most three requests and a thirty-second overall timeout. HTTP 404 returns no proposals. Other HTTP, identity, transport and pending-timeout failures create optional lookup warnings; retry resumes that provider. Completed lookups are reused when another stage is retried. Each HTTP request records provider telemetry without registration or response content. Every request can consume provider quota, including pending and not-found responses.

Field source references record Zyfy, the lookup URL, retrieval time and source `dataAsOf` when supplied. Another explicit Import can refresh fields that allow automatic population. Refresh scheduling is not automatic. Source and derived date values can become stale between lookups; days remaining are calculated from dates when needed. Zyfy provides MOT summaries rather than individual test records or defect descriptions. [Coverage](https://zyfy.uk/docs/coverage) and [signals](https://zyfy.uk/docs/vehicle/signals) describe the source data.

Run `pnpm db:migrate`, `pnpm db:seed` and restart the API after updating. The key stays on the server. Provider tests use synthetic responses and make no Zyfy requests.

## Validation

`server/tests/import/`, `server/tests/fields/` and `server/tests/jobs/` cover the workflow, owner permissions, shared-resource lifecycle, specialist mapping and concurrent execution. Integration and browser tests use fixture providers and isolated databases. `pnpm check` checks authored and generated contracts, types, lint, unit tests and builds. `pnpm test:integration` requires local PostgreSQL and a built frontend.

The paid smoke script traces the current workflow. Standalone extraction and document-evaluation helpers remain for the opt-in model evaluations documented in [import evaluations](../requirements/research/import-evaluations.md). Each invocation requires explicit approval under [metered AI validation](../agents/agent-behaviour.md#metered-ai-validation).
