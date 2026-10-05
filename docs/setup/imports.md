# Import process

Imports turn a photo, PDF or text source into Thing fields, then find category documents and a product photograph. Fastify owns workflow decisions and persistence; OpenAI proposes facts, mappings and cited resources. Application API calls are authenticated and owner-scoped.

## Sequence

1. **Upload.** [ThingsStore.startImport](../../src/app/core/state/things.store.ts) sends a private source through [AttachmentsService](../../src/app/core/data/attachments.service.ts) to `POST /api/attachments`. Pasted text becomes a `text/plain` file. Existing attachments can start at step 2.

2. **Queue.** `POST /api/things:import` accepts `{ attachmentId, thingId? }`. [Import persistence](../../server/src/db/entities/imports.ts) links the source, creates an `Importing…` skeleton when needed and stores a `QUEUED` job. The [route](../../server/src/routes/imports.ts) returns `202 { importId, thingId, status }` and wakes the runner.

3. **Watch.** [ThingLoader](../../src/app/features/things/thing-loader.ts) opens an authenticated Thing stream. Commits publish owner-scoped `data.changed` events; the server sends revisioned `thing.snapshot` events from persisted state. Reconnecting restores progress and masked values.

4. **Run.** [JobRunner](../../server/src/application/jobs/runner.ts) serially processes imports and assistant work. A dedicated [database session lock](../../server/src/db/job-lease.ts) permits one active runner per database. [ImportProcessor](../../server/src/application/import/processor.ts) drives the stages and records usage.

5. **Extract — `EXTRACTING`.** The processor reads the private blob and calls [OpenAiImports.extract](../../server/src/providers/ai/openai-imports.ts) with allowed categories. The tool-free Responses request returns document metadata and quoted facts grouped by Thing, with page references and sensitivity. Local PDF text retains original page labels; text sources retain their literal content. [Validation](../../server/src/application/import/mapping.ts) precedes saving private extraction and missing attachment metadata. Owner metadata edits and clears survive.

6. **Allocate destinations.** One candidate is selected automatically. Multiple candidates enter `AWAITING_SELECTION`; API clients can confirm candidate/destination pairs through `POST /api/imports/{id}:confirm`. Allocation reuses the skeleton for the first new Thing and links the source transactionally. The current UI has progress and retry controls; candidate selection remains API-only. The [single-Thing lifecycle](../plans/import-improvements.md#3-import-identity-and-single-thing-lifecycle) is planned.

7. **Map — `MAPPING`.** The processor awaits `selectFieldSets`, expands mandatory dependencies, then calls `mapFacts` with up to 20 facts per batch. Selection uses `search_field_sets`; mapping uses `search_fields` for unmatched standalone definitions. Each batch has a fresh conversation containing the Thing context, selected definitions and current facts. Every fact receives a registry mapping, useful custom-field decision or discard decision. The server validates retrieved IDs, category, membership, schemas, sensitivity and dispositions, then commits each batch with its checkpoint and publishes progress. Conflicting evidence retains source references; owner edits and clears survive. All destinations finish mapping before research.

8. **Research — `DISCOVERING`.** [Public field selection](../../server/src/application/public-fields.ts) supplies populated fields classified as `instanceSpecific: false`, including explicitly classified custom fields. Zero, false and empty strings remain values. [buildResearchThing](../../server/src/application/import/mapping.ts) adds empty eligible field targets, excluding owner clears. Sensitivity controls masking independently. Raw sources and instance-specific values remain outside public search input. [Category prompts](../../server/src/providers/ai/prompts.ts) set document priorities. `findResources` uses one bounded web search, fetches up to three retrieved pages for observed PDF/image links, then structures cited resources in a tool-free request.

9. **Enrich.** [ResearchSession](../../server/src/application/import/research.ts) considers up to three PDFs. Protected [retrieval](../../server/src/providers/web/pdf.ts) checks HTTPS, DNS addresses, redirects, streamed size and PDF contents. `extractDocument` receives the document, public context and up to 20 requested fields, with no search or write tools. It must establish applicability with page/quote evidence; official download-page context can establish coverage by a family manual. The server validates evidence bounds, field addresses and schemas. Applicable documents become private attachments. Each batch fills still-empty fields with `DISCOVERY` provenance and attachment/URL/page/quote references under a Thing row lock, saving the checkpoint atomically. Owner edits, clears and removed sets are rechecked. Five field batches are allowed per document.

10. **Attach a photo.** An official model page supplies the matching product image and source evidence. [Image retrieval](../../server/src/providers/web/image.ts) shares the protected downloader and validates headers, dimensions and decoding. The private attachment retains source provenance. It becomes the main image while that choice remains unset and unedited. Owner choices, clears and unlinking survive retries. Image failures preserve documents and fields.

11. **Finish.** The job becomes `COMPLETE`; optional research failures add API warnings while preserving committed results. Completed-import warning display and research retry controls remain pending frontend work. Database or blob-write failures propagate to the import failure path. Saved attachments and completed document batches remain available for retry through the API.

## Limits

| Input or operation              | Limit                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Uploads and retrieved documents | Configured `MAX_UPLOAD_BYTES`, capped at 100,000,000 bytes for import documents                              |
| PDF parsing                     | Worker with 15-second deadline and 256 MiB old-generation heap                                               |
| Extracted text                  | 1,000,000 characters, retaining original PDF page labels and line breaks                                     |
| PDF vision fallback             | 25 pages and 40 MB when embedded text is absent                                                              |
| Product images                  | 5 MB and configured upload limit; JPEG, PNG or WebP; at least 200 × 200 pixels and at most 16 million pixels |
| Retrieved page HTML             | 2 MB per page; up to three pages                                                                             |
| Resource retrieval              | 15 seconds per resource, up to three redirects                                                               |
| Mapping and field extraction    | 20 facts or requested fields per batch                                                                       |

PDF text extraction reads every page. The model prefers English sections and ignores translated repetitions. Embedded text extraction does not read images or guarantee table reading order. Configured timeouts and tool budgets are listed in [README](../../README.md#configuration).

## Failure and retry

- Extraction and mapping share `IMPORT_TIMEOUT_MS`. Selection and each mapping batch have separate `IMPORT_TOOL_ROUNDS` budgets. Failures become `FAILED` before destination allocation or `INCOMPLETE` afterwards; sources and committed values remain available.
- Research has its own deadline and web-call budget. Search, download, parsing and model-output failures become warnings. Persistence failures remain fatal. Usage persistence reached through a provider callback retains that distinction.
- `POST /api/imports/{id}:retry` requeues failed/incomplete jobs and completed jobs with warnings. Saved extraction, selected sets, committed fact batches, attachments and full-document checkpoints are reused. Legacy page-range checkpoints are reconsidered against the whole document.
- Research retries search once for alternatives after warnings. Rejected URLs and limits accompany the search. Unchanged deterministic size/model-input rejections skip retrieval; changed limits allow reconsideration.
- SDK transport retries are disabled. Restart recovery marks interrupted work failed for explicit retry; queued jobs resume after the runner acquires its session lock.
- `GET /api/imports/{id}` exposes status, candidate summaries while awaiting selection, result IDs, sanitised errors, warnings and usage. Full extraction remains private. Usage entries identify task, model, tokens and request latency.
- Application names are `ExtractedThing` and `extractedThings`; persistence and provider wire data retain `candidates` until the lifecycle migration.

## Provider configuration and evaluations

The adapters use the [official OpenAI TypeScript SDK](https://developers.openai.com/api/docs/libraries). [Prompts](../../server/src/providers/ai/prompts.ts) and [schemas](../../server/src/providers/ai/schemas.json) are authored separately. Shared schema references are expanded once for provider requests, validation and generated types. Run `pnpm ai:generate` after schema edits; `pnpm ai:check` checks drift.

`DOCUMENT_EXTRACTION_MODEL` selects the contained document task's model and defaults to `OPENAI_MODEL`. Dated PDF, fact-selection and model comparisons, including the paid evaluation command, are in [import evaluations](../requirements/research/import-evaluations.md).

Assistant chat reads existing attachments and uses its independent `ChatAi.research` operation for cited answers to public questions. It shares public-field selection and bounded web search; results are saved in the message for retry.
