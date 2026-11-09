# Import observability and evaluations

Langfuse receives server measurements through OpenTelemetry. The product frontend and HTTP contracts do not depend on it. Provider observations contain task names, identifiers, status, timing, token usage and costs. Prompts, source content, queries, credentials and model output are excluded from application telemetry.

## Configuration

Set these server environment variables:

```dotenv
LANGFUSE_PUBLIC_KEY=...
LANGFUSE_SECRET_KEY=...
LANGFUSE_BASE_URL=https://cloud.langfuse.com
LANGFUSE_TRACING_ENVIRONMENT=development
```

Both keys enable tracing when the server starts. `LANGFUSE_TRACING_ENABLED=false` disables it. Use `production` for the hosted environment. Add the variables to Render separately when enabling hosted tracing. `RENDER_GIT_COMMIT` identifies the deployed revision.

Application tracing can use an **Ingestion** project key. Reports, dashboard setup and experiment tooling need a **Full access** project key. Credentials stay in server configuration. Initialization and export failures do not change import results. Shutdown stops background work before flushing pending observations.

The pinned packages use Langfuse 6.1.1, OpenTelemetry Node SDK 0.223.0 and OpenTelemetry API 1.9.1. These satisfy Langfuse's peer dependencies; the newer OpenTelemetry 0.300 series requires another dependency combination.

## Views and reports

Run `pnpm metrics:dashboard` to create or update the shared **Import costs and timing** dashboard. The command prints its URL. Use the dashboard's environment selector to view `development`, `production` or setup checks. Widgets follow that selector; keep environment filters at dashboard level because widget environment filters override it. The dashboard contains:

- Known charges by task and provider, in USD.
- Input and output tokens by task. Input totals include cached input tokens.
- p95 task duration in milliseconds, including model turns, tools and validation.
- Provider call counts and known charges by task/provider.

The dashboard covers import execution and attachment preparation. It excludes chat traces and SDK experiments. Use Langfuse's trace view for individual call timelines. The import or attachment UUID with its hyphens removed is its trace ID. Attempts share a trace and have separate root observations; every model turn has a separate generation. Hosted web-search charges are separate tool observations under the calling task. Their internal duration is unknown and remains included in the model request's duration.

For an import and all its sources:

```bash
pnpm metrics:import <import-id> <owner-id>
```

This command reads the owner-scoped import and its current source relationships from the configured database. It retrieves the corresponding Langfuse traces and prints JSON with:

- Import work, associated source preparation and a combined summary.
- Provider and task breakdowns, cached tokens, known charges and unpriced call counts.
- Missing trace IDs, covering older work or observations that have not arrived yet.

Attachment transcription runs independently and can precede import creation. It is recorded once using the attachment ID. Reusing an attachment adds no telemetry copy or new provider charge. A report includes that attachment's earlier preparation as associated work; adding reports for separate imports can therefore count shared preparation more than once. Global dashboards count the original provider observations once.

Summed request duration measures work across calls; overlapping requests can exceed import wall time. Trace timelines show that overlap. Queue time and time waiting for the user are not provider duration. Telemetry is delivered asynchronously, so reports immediately after an import may be incomplete. Missing traces and unknown usage/prices must not be treated as zero spend. Observations lost on an abrupt process exit are not reconstructed from the existing usage JSON.

## Cost interpretation

Langfuse calculates model costs using provider-reported usage, the returned model and service tier. Cached input is separated from uncached input before export. Reasoning tokens already included in output usage are not added again.

External service rates are module constants, checked on 9 November 2026:

| Operation                  | Recorded standard rate                                  | Source                                                           |
| -------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------- |
| OpenAI hosted web search   | USD 0.01 per completed call, plus model token charges   | [OpenAI pricing](https://developers.openai.com/api/docs/pricing) |
| Google Vision document OCR | USD 0.0015 per image or rendered PDF page               | [Vision pricing](https://cloud.google.com/vision/pricing)        |
| Resource download          | Zero provider fee; infrastructure usage excluded        | Application download operation                                   |
| Icecat lookup              | Unknown; subscription cost is not allocated per request | Account-specific access                                          |

These are calculated service charges before account credits, Google Vision's monthly free allowance, volume discounts, tax and currency conversion. They are not reconciled invoices. Failed or interrupted calls without reported usage have unknown cost. An unsuccessful validation still includes charges for completed provider calls. Update the service constants when rates change; Langfuse manages model prices independently.

## Verification

`pnpm metrics:check` exercises the application task and telemetry boundaries with invented responses. It uploads synthetic traces in the `setup-check` environment, uses a mocked OpenAI request and makes no AI provider calls. It prints trace IDs for two imports and one attachment. Read them back through the current Langfuse Observations API, including `usage` and `metadata` fields. Check the trace hierarchy, four model turns, one OCR charge and cached-token counts.

Default unit and integration checks use an in-memory exporter or no exporter. They do not upload telemetry or invoke metered models. Provider tests check context isolation, sanitised failures and accounting; import and transcription integration tests exercise their existing workflow paths.

## Evaluating task changes

The document-extraction evaluator can publish experiments using its authored synthetic fixtures:

```bash
node --import tsx --env-file=.env scripts/evaluate-document-extraction.ts --langfuse
```

This is a **paid** command. Obtain approval for each invocation under [metered AI validation](../agents/agent-behaviour.md#metered-ai-validation). `--models=model-a,model-b` selects models; each has four fixture cases with up to two attempts per case. The default comparison can therefore make up to sixteen model requests. The evaluator uploads its synthetic inputs, expected labels, outputs and scores to Langfuse and writes its local JSON report.

Each model produces an experiment with its code revision. Scores measure fixture pass/fail, correct fields, incorrect fields and citation errors. Use the same fixtures and scoring definitions when comparing revisions. Review case-level regressions alongside costs and latency. A missing case or missing pass/fail score fails the evaluation run. These fixtures evaluate the document helper; they do not establish full-import quality.

The scoring functions run locally and need no hosted LLM connection. Hosted model judges can be added after choosing and calibrating their rubrics. [Langfuse experiments](https://langfuse.com/docs/evaluation/experiments/experiments-via-sdk) describes the runner and comparison workflow.
