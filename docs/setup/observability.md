# Backend observability and evaluations

- **Render** captures Fastify JSON logs in production. Use event names and IDs to find queue submissions, job attempts, warnings and dependency failures. Routine HTTP request logs use `trace` and carry the route template.
- **Sentry** groups unexpected exceptions and receives sampled API spans and service metrics. The request handler and job wrapper attach correlation IDs. API duration, job outcomes, queue depth and age, pool pressure and stream closures can be queried without enabling routine HTTP logs.
- **Langfuse** receives AI workflow traces through OpenTelemetry. Provider observations carry task, model, usage, cost and timing. Workflow observations add statuses, counts and saved display names where relevant. Prompts, attachment contents, raw queries, credentials and model output stay in the application.

`userId` identifies a Boring Things account in logs, trace metadata and Langfuse user tracking. Shared attachment work is correlated by attachment ID. Join an HTTP submission to a worker attempt by the job ID and use its `attemptId` to distinguish retries.

Queue gauges are sampled once a minute when the server Sentry DSN is configured. Imports waiting for source transcription have their own series. The ready queue clock starts when the job becomes eligible for processing. Queue entries that predate the timestamp migration contribute to depth. Age and wait measurements require a recorded timestamp.

## Configuration

Set these server environment variables:

```dotenv
LANGFUSE_PUBLIC_KEY=...
LANGFUSE_SECRET_KEY=...
LANGFUSE_BASE_URL=https://cloud.langfuse.com
LANGFUSE_TRACING_ENVIRONMENT=development
```

Both keys enable tracing when the server starts. `LANGFUSE_TRACING_ENABLED=false` disables it. Use `production` for the hosted environment. Add the variables to Render separately when enabling hosted tracing. `RENDER_GIT_COMMIT` identifies the deployed revision.

Application tracing can use an **Ingestion** project key. Reports and experiment tooling need a **Full access** project key. Credentials stay in server configuration. Initialization and export failures do not change import results. Shutdown stops background work before flushing pending observations.

The pinned packages use Langfuse 6.1.1, OpenTelemetry Node SDK 0.223.0 and OpenTelemetry API 1.9.1. These satisfy Langfuse's peer dependencies; the newer OpenTelemetry 0.300 series requires another dependency combination.

## Views and reports

The shared [Import costs and timing dashboard](https://cloud.langfuse.com/project/cmw9d4c5y01ylad0d7wra3ifz/dashboards/cmw9mjogl017gad0eq3m9kige) is maintained in Langfuse. Edit its charts and layout there. The repository owns telemetry collection; chart definitions are managed in Langfuse. Use the dashboard's environment selector and date range to choose the data. Keep environment filters at dashboard level because widget environment filters override the selector.

| Panel                                   | Question it answers                                                    |
| --------------------------------------- | ---------------------------------------------------------------------- |
| Requests, cost and timing per import    | How many HTTP requests did each task make, at what cost and duration?  |
| OpenAI web searches and fees per import | How many web searches did each task trigger, and what were their fees? |
| Most expensive tasks                    | Which provider tasks account for the most known spend?                 |
| Slowest provider requests               | Which tasks have the slowest provider attempts at the 95th percentile? |
| Known spend by provider                 | What is the total known spend for each provider?                       |
| Requests by provider                    | How many HTTP requests did each provider receive?                      |
| Task cost and timing                    | Is a task costly because of frequency, cost per request or duration?   |

A request is one HTTP exchange with a provider, usually one model turn. One AI task execution can make several requests. OpenAI's built-in web searches are tool invocations within model requests and have their own count and fees; they are not additional HTTP requests from this application.

The import request table includes request count, total and average request cost, and median and p95 request duration. Its filter excludes web-search observations so the request count stays accurate. Langfuse applies a widget's filter to every metric, so the separate web-search table supplies search counts and fees. Add the two cost subtotals for the full known import execution cost.

Import tables group by session ID, which is the import UUID, and task name. They cover execution and retries in the selected time window, sorted by spend, with up to 1,000 groups. They exclude independently processed attachment preparation; use the report below for combined import and source costs. Provider spend totals include attachment preparation and web-search fees once each. Provider request totals and timing panels include HTTP attempts only.

Background job outcomes appear as `job_finished` in the Fastify logs and in the corresponding Langfuse trace. Both include the job ID, attempt ID, saved status and elapsed time. Failures include the stage and a reason code. If saving the outcome fails, the event identifies that stage and omits the status. `job_runner_failed` identifies processor, recovery or database lease failures. Sentry captures unexpected errors with the operation, reason and stack frames after removing exception messages.

Search by import ID for `import_stage_warning` events and the `job_finished` event. For `EXTRACTION_FAILED`, take the attachment ID from the warning and search for that ID as the attachment job ID. PDF diagnostics distinguish parser timeouts, worker memory limits, and failures opening, reading or rendering the document. Job diagnostics omit filenames, URLs, document text and raw exceptions.

Provider failures include an HTTP status and request ID when available, or the SDK error class and network cause code. Import deadlines and shutdown have separate reason codes. Text batch observations give source offsets, timing and call counts. Recommendation observations give proposal, validation and save counts. The dashboard groups by import UUID.

Cost charts show known charges; unpriced requests are not free. Langfuse can display unpriced attempts as zero in cost averages, which may understate actual costs. Check model-price definitions in Langfuse's model settings when usage has no calculated price.

The dashboard covers import execution and attachment preparation. It excludes chat traces and SDK experiments. Use Langfuse's trace view for individual request and tool timelines. The import or attachment UUID with its hyphens removed is its trace ID. Attempts share a trace and have separate root observations; every model turn has a separate generation. OpenAI web-search charges are separate tool observations under the invoking task. Their internal duration is unknown and remains included in the model request's duration. Only completed searches count against the task's search budget. Unfinished attempts record their status and the model response ID with an unknown charge.

The [Chat costs dashboard](https://cloud.langfuse.com/project/cmw9d4c5y01ylad0d7wra3ifz/dashboards/cmwc4afnl01gjad0eimjxp2gv) ranks turns by trace ID and conversations by session ID. A chat trace ID is the assistant message UUID without hyphens. The conversation panel groups observations with `sessionKind=conversation` by conversation UUID. Older chat observations used the assistant message UUID as the session ID. Use the trace to see when the turn ran, which tasks ran, and which models they used.

For an import and all its sources:

```bash
pnpm metrics:import <import-id> <user-id>
```

This command reads the user-scoped import and its current source relationships from the configured database. It retrieves the corresponding Langfuse traces and prints JSON with:

- Import work, associated source preparation and a combined summary.
- Provider and task breakdowns, cached tokens, known charges and unpriced observation counts.
- Missing trace IDs, covering older work or observations that have not arrived yet.

Attachment transcription runs independently and can precede import creation. It is recorded once using the attachment ID. Reusing an attachment adds no telemetry copy or new provider charge. A report includes that attachment's earlier preparation as associated work; adding reports for separate imports can therefore count shared preparation more than once. Global dashboards count the original provider observations once.

Summed request duration measures work across requests; overlapping requests can exceed import wall time. Trace timelines show that overlap. Queue time and time waiting for the user are not provider duration. Telemetry is delivered asynchronously, so reports immediately after an import may be incomplete. Missing traces and unknown usage/prices must not be treated as zero spend. Observations lost on an abrupt process exit are not reconstructed from the existing usage JSON.

## Cost interpretation

Langfuse calculates model costs using provider-reported usage, the returned model and service tier. Cached input is separated from uncached input before export. Reasoning tokens already included in output usage are not added again.

External service rates are module constants, checked on 9 November 2026:

| Operation                  | Recorded standard rate                                                      | Source                                                           |
| -------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| OpenAI built-in web search | USD 0.01 per completed web-search tool invocation, plus model token charges | [OpenAI pricing](https://developers.openai.com/api/docs/pricing) |
| Google Vision document OCR | USD 0.0015 per image or rendered PDF page                                   | [Vision pricing](https://cloud.google.com/vision/pricing)        |
| Resource download          | Zero provider fee; infrastructure usage excluded                            | Application download operation                                   |
| Icecat lookup              | Unknown; subscription cost is not allocated per request                     | Account-specific access                                          |

These are calculated service charges before account credits, Google Vision's monthly free allowance, volume discounts, tax and currency conversion. They are not reconciled invoices. Failed or interrupted requests without reported usage have unknown cost. An unsuccessful validation still includes charges for completed provider requests. Update the service constants when rates change; Langfuse manages model prices independently.

## Verification

`pnpm metrics:check` exercises the application task and telemetry boundaries with invented responses. It uploads synthetic traces in the `setup-check` environment, uses a mocked OpenAI request and makes no AI provider requests. It prints trace IDs for two imports and one attachment. Read them back through the current Langfuse Observations API, including `usage` and `metadata` fields. Check the trace hierarchy, four model turns, one OCR charge and cached-token counts.

Default unit and integration checks use an in-memory exporter or no exporter. They do not upload telemetry or invoke metered models. Provider tests check context isolation, sanitised failures and accounting; import and transcription integration tests exercise their existing workflow paths.
