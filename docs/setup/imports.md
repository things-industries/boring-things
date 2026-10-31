# Import process

Imports resolve one Thing from uploaded evidence, save its identifiers, research public resources and specialised data, select fieldsets, populate fields and recommend tasks and products. Fastify owns validation and persistence. Model tasks propose cited results.

## Entry points

- Uploads start Attachment transcription independently. Plain text is decoded directly. PDFs use local text extraction per page; pages without text are rendered locally and read by Google Vision OCR, as are uploaded images. The `summarize-attachment` AI task receives only the resulting text and returns summary, terms, identifier observations, display metadata and language/readability status. Attachment processing saves the extracted text separately. Missing credentials or OCR errors fail transcription; sources without recognised text finish as empty. `POST /api/imports` accepts up to ten Attachment IDs and optional Thing context. The Import waits for submitted sources to finish or fail, then uses readable sources.
- Thing context supplies the target for ambiguous scraps. Contradictory identity evidence produces `wrong_thing`. An open Import without an identifiable Thing produces `no_thing_identified`.
- The strongest candidate is selected and matched semantically against the owner's existing Things. Only one Thing is processed.
- **Find more details** submits an Import with Thing context and no new Attachments. It starts at Research and uses existing linked content during population.
- **Refresh recommendations** calls `POST /api/things/{thingId}:recommend`. It runs the same Recommendation capability that finishes Imports.
- Manual creation saves a Thing directly. Empty Import input without a Thing completes without work.

## Workflow

[ImportWorkflow](../../server/src/application/import/workflow.ts) persists the following stages:

1. **Identify.** Extracted source text is reviewed in bounded summary requests while the complete text is saved separately. Use source summaries, terms, possible printed identifiers and bounded transcription searches. Validate the category, owned match and source citations. Create or match the Thing, add mandatory fieldsets, save identifiers and link relevant sources in one transaction.
2. **Research.** Applicable specialist providers return registry field and fieldset proposals. Each provider's accepted changes and completion checkpoint are saved before public research. Icecat is enabled by `ICECAT_ACCESS_TOKEN`. For appliances and devices, `common.gtin` triggers a GTIN lookup; otherwise `common.manufacturer` plus `appliances.productCode` or `common.model` triggers a brand/product-code lookup. Product code takes precedence over model. Serial numbers and manufacturer alone do not trigger it. Returned GTIN or brand/product-code identity must match before fields are saved.
3. **Find resources.** Reuse shared Attachments with registry-linked class coverage, then search public sources using eligible public fields and category hints. Include the name resolved from submitted sources so model years and generations remain available during resource and recommendation research. Requests without submitted sources use public fields. Apply a cited everyday name to a newly imported Thing unless the owner has edited its name; field selection and recommendations use the updated name. Download cited PDFs and images through the existing protected retrieval helpers, using an application User-Agent for sites that reject requests without one. Save them as unowned public Attachments, link them to the Thing and Import, and await independent transcription for documents. Product photographs skip transcription and field/recommendation evidence, including photographs saved by earlier imports. Assess document applicability and save quoted group/class identifier coverage for reuse.
4. **Select fieldsets.** Review applicable linked-source summaries and terms. Validate selections against retrieved category fieldsets and materialise empty field occurrences.
5. **Populate.** Search saved transcriptions for enabled field targets in batches of twenty. Validate field membership, value schemas, original pages and source quotes after trimming and collapsing whitespace. Public resources supply class data. Read the current Thing under a row lock and recheck its population permissions and cited source links before saving each batch.
6. **Additional information.** Review private uploaded text in batches of 20,000 characters using its task model. Keep only significant information about identifying, operating, maintaining or administering the Thing. Search registry fields before proposing custom fields. Reuse existing occurrences and preserve protected values. Other validation failures produce retryable warnings while recommendations continue.
7. **Recommend.** A local model task consults linked Attachment content and Thing fields for cited tasks and purchasables. Its tools only search saved sources. Public task and purchasable research run in parallel to find category-directed tasks and compatible purchasables with observed purchase URLs. Usage snapshots and result commits run in sequence; retry reuses each completed operation. Save suggestions without replacing existing owner decisions. Intervals remain descriptive; scheduling belongs to the owner.

[AI tasks](../../server/src/providers/ai/tasks/task.ts) share SDK execution for buffered and streamed responses, conversation history, validated structured outputs, typed tools, cancellation and usage reporting. The base class constructs the SDK client and declares the typed `run()` contract. Tasks register a completion callback with `onTurnCompleted()`; awaited usage persistence stays in the execution context. Each task module owns its prompt, output schema, model selection and conversion into application results. Thing-oriented tasks include the shared Thing definition in their instructions; attachment summaries and delegated public research use their own evidence rules. Document extraction receives the subject name, and linked-source recommendations receive field labels, descriptions and validation schemas alongside values. Shared prompt text stays in `providers/ai/prompts.ts`; shared model tool adapters stay in `providers/ai/tools/`. Task schemas are independent of the HTTP OpenAPI contract. Run `pnpm ai:generate` after schema changes and `pnpm ai:check` to check generated internal types. The application awaits every proposed write. Authenticated revisioned Import and Thing SSE snapshots expose progress without raw source text.

Source-evidence comparisons trim and collapse whitespace on both sides. Extracted text keeps its original formatting. An identifier observation, field proposal, coverage claim, additional finding or source-based suggestion with a mismatched quote or invalid page is skipped individually; other source content continues through the workflow. Extracted identifier labels, values and saved quotes also use trimmed, collapsed whitespace.

## Suggested tasks

Public research and linked-source recommendations share task-selection and naming guidance. Suggestions describe maintenance or administration work that the owner can perform and mark complete, including recurring work and relevant one-off actions such as submitting an insurance claim. Passive waiting, routine operating advice and recovery advice for exceptional incidents belong in care or troubleshooting guidance. Boring Things handles importing identifiers, policy details and documents. Identification labels and document metadata alone do not justify maintenance or administration tasks.

Titles name the action and object, keeping only qualifiers needed to identify the work. Frequency, triggers, methods, precautions and evidence requirements belong in descriptions. For example, use **Clean the watch band**, with material-specific instructions in its description; **Clean dirty door seals** can keep its condition. Suggestions represent each underlying action once. Linked-source recommendations compare supplied existing tasks by meaning, including completed and dismissed tasks. Public research receives eligible public context; application checks exclude matching existing titles.

## Fields and owner decisions

`bt.thing_fields` stores values, occurrence addresses, provenance and `auto_populate`. Thing metadata retains fieldset selection, pins and owner decisions. API responses project field occurrences into fieldsets, standalone fields and custom fields.

Mandatory fieldsets have null eligibility. Category identifiers have a mandatory occurrence before research. Empty registry fields added manually remain eligible for population. Imported fields are eligible. Manual values and custom fields disable automatic population; manually clearing a registry value retains an empty disabled occurrence. A `ValuePatch` can change `autoPopulate` alone while retaining the value and provenance. Every automatic writer uses the same permission check.

Changing category or removing a populated fieldset preserves values, sensitivity, provenance and pins through custom fields. Owner-removed fieldsets, custom fields and Attachment links are recorded so automatic work cannot restore them.

## Shared resources and access

User uploads remain private. Discovered public resources are saved once with unowned content, transcription, public metadata and cited identifier coverage. Owner-scoped Thing links control associations. Attachment responses list only the requesting owner's Things. Import and citation references also retain access to public evidence after unlinking.

Owners may unlink shared resources. Shared metadata and content are system-managed; owners cannot change or physically delete them. Private Attachment deletion is rejected while a Thing, Import or citation still references it. Deleting a Thing removes its job and links while retaining shared files.

## Execution and recovery

[JobRunner](../../server/src/application/jobs/runner.ts) runs Import/Recommendation, transcription and chat processors concurrently. Each processor handles one job at a time. A PostgreSQL session lock permits one runner per database; recovery runs after acquiring leadership, and shutdown awaits all processors before releasing it.

Identity, specialist results, resources, field batches and recommendations have saved checkpoints. Application changes and completion records share a transaction. Restart requeues interrupted work. Retry reuses completed work, requeues failed source transcription and resumes unfinished stages. Source fingerprints make changed transcription or links eligible for renewed field work, and commit-time checks prevent stale evidence writes.

Identity failures become explained errors. Failed Imports save the stage and a bounded failure reason in the internal workflow checkpoint; retry removes that failure record. Optional research and recommendation failures retain retryable warnings and saved results. Other recommendation validation failures produce warnings with fixed validation reasons saved in the internal workflow checkpoint. Persistence failure prevents a completion checkpoint. Completion and errors release processing restrictions. The frontend shows unfinished work and offers retry, including completed jobs with warnings.

## AI task configuration

Each task declares its model and reasoning effort in `server/src/providers/ai/tasks/`. The base task sets standard reasoning mode for every request. Credentials and request limits come from server configuration. Task model choices apply to imports, recommendations and chat.

| Task                                  | Model         | Reasoning effort |
| ------------------------------------- | ------------- | ---------------- |
| Attachment summary                    | `gpt-6-luna`  | `low`            |
| Thing resolution                      | `gpt-6.1-sol` | `medium`         |
| Fieldset selection                    | `gpt-6-luna`  | `low`            |
| Resource applicability                | `gpt-6.1-sol` | `medium`         |
| Field population                      | `gpt-6-luna`  | `low`            |
| Additional information                | `gpt-6.1-sol` | `low`            |
| Linked-source recommendations         | `gpt-6-luna`  | `low`            |
| Resource search                       | `gpt-6.1-sol` | `medium`         |
| Resource structuring                  | `gpt-6-luna`  | `none`           |
| Public task suggestions               | `gpt-6-luna`  | `low`            |
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
| Model conversation text     | `IMPORT_MAX_TEXT_CHARACTERS`, default 120,000 characters                     |
| Model requests              | `IMPORT_MAX_REQUESTS`, default sixty per Import or Attachment across retries |
| Local tool calls            | `IMPORT_TOOL_ROUNDS`, default four per task or batch                         |
| Field population            | Twenty requested fields per batch                                            |
| Additional information      | 20,000 source characters per batch                                           |
| Import attempt              | `IMPORT_TIMEOUT_MS`, default 180,000 ms                                      |
| Resource transcription wait | `DISCOVERY_TIMEOUT_MS`, default 90,000 ms                                    |
| Public web search           | `DISCOVERY_SEARCH_CALLS`, default three per research operation               |

Upload size, PDF parsing and image decoding also use the limits in the retrieval helpers. Request entries record model, token usage and latency; Import usage includes source transcription usage and records tool calls and elapsed time. When a local tool-call limit is reached, the task disables further tools and requests a final answer using the evidence already gathered. Request, text and timeout limits still apply. Other limit failures keep committed work for review or retry with revised configuration.

Icecat uses the [Product JSON API](https://iceclog.com/manual-for-icecat-json-product-requests/) with the token in the `api-token` header. Free Open Icecat access covers participating brands such as Philips; absent, restricted and unreleased products return no proposals. Authentication, transport and malformed-response failures create retryable warnings. No brand list is hard-coded. Mapped fields include manufacturer, model, GTIN, unqualified overall dimensions, appliance finish and electrical supply, and device weight, screen diagonal and display resolution when supplied. Feature IDs select meanings and display values keep units; package and stand-specific dimensions are omitted. The shared writer applies owner permissions. Run `pnpm db:seed` and restart the API after updating the registry. No provider credentials reach the browser.

## Validation

`server/tests/import/`, `server/tests/fields/` and `server/tests/jobs/` cover the workflow, owner permissions, shared-resource lifecycle, specialist mapping and concurrent execution. Integration and browser tests use fixture providers and isolated databases. `pnpm check` checks authored and generated contracts, types, lint, unit tests and builds. `pnpm test:integration` requires local PostgreSQL and a built frontend.

The paid smoke script traces the current workflow. Standalone extraction and document-evaluation helpers remain for the opt-in model evaluations documented in [import evaluations](../requirements/research/import-evaluations.md). Each invocation requires explicit approval under [metered AI validation](../agents/agent-behaviour.md#metered-ai-validation).
