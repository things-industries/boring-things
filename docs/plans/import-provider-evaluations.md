# Import latency and provider evaluations

Status: planned.

Measure quality, latency and full-task cost for import operations, then evaluate task-specific models and alternative providers. Use the workflows and scenarios in the [attachment extraction and Thing processing plan](import-improvements.md). Existing measurements are recorded in [import evaluations](../requirements/research/import-evaluations.md).

## Task baseline

Build a task baseline from existing usage logs and persisted task usage: extraction, identity matching, field-set selection, mapping, resource retrieval, reference extraction, task suggestions and purchasable discovery. Record model/provider, prompt/schema version, input size/pages, tokens, request count, retries, stage duration, total duration and measured or dated estimated task cost. Include tool and retrieval costs. Report median and tail latency, failure rates and reuse savings.

## Evaluation approach

- Maintain labelled, synthetic or redacted fixtures covering the [attachment and Thing-processing use cases](import-improvements.md#use-cases), bulk quantities, duplicate instances, ambiguous matches, irrelevant attachments, family manuals, multilingual/long documents and conflicting owner values.
- Separate deterministic fixture checks from paid provider evaluations. Version datasets and expected outcomes; retain cited evidence and score errors by severity.
- Measure Thing Candidate recall and precision, instance-match false positives, field-set selection, field precision/recall, unwanted custom fields, provenance, document applicability, retrieval success and suggestion compatibility. Unsafe instance merges and private-data exposure are release blockers.
- Compare candidate configurations on the same fixtures and full task, including validation, retries and fallback. Set quality thresholds and latency/cost targets before selecting a configuration. Keep a held-out dataset for the adoption decision.
- Paid evaluations remain opt-in and require owner approval for each invocation under [metered AI validation](../agents/agent-behaviour.md#metered-ai-validation). Default CI uses mocks and fixtures.

## Per-task model and provider selection

Choose configurations by task results. Evaluate smaller/faster models for bounded extraction, field selection and mapping; evaluate identity and research tasks against their own evidence and quality needs. Configure task-specific models behind existing application/provider boundaries, with bounded fallback policies, checkpoint reuse and observable routing. Record fallback cost and latency in the comparison.

Experiment with Jev for bounded decisions over extracted evidence, Firecrawl for retrieval and other providers where baseline measurements identify an opportunity. These are evaluation candidates; adoption requires an approved provider/infrastructure decision. Assess schema compatibility, source citations, privacy, retention, regional availability and operational failure handling alongside quality, latency and cost. Keep raw private sources and instance-specific values within their authorised processing scope.

Measure whether a separate identification pass reduces time to the first Thing or duplicates extraction cost. Persist source coverage and truncation; opening-page scans of long documents cannot identify all Things described in the source. Partial coverage exposes unresolved source regions and permits continued extraction without presenting the Thing Candidate list as complete. Compare single-pass extraction, page-aware batches and cached extraction reuse.

[Research references](../requirements/research/sources.md#import-provider-evaluation--4-october-2026) contain starting sources for experiments. Verify current provider capabilities and pricing when running comparisons. Record reproducible configurations, scores, latency, cost and the adoption recommendation in [import evaluations](../requirements/research/import-evaluations.md).

## Validation

- Run labelled offline checks with fixtures and mocks; keep paid provider runs opt-in.
- Obtain owner approval for each paid invocation and rerun under the linked metered AI validation rules.
- Compare quality thresholds, latency, failures and full-task cost on the same fixtures and held-out data before recommending adoption.
- Record input data, configurations, provider/model versions, scores, costs, limitations and the recommendation in [import evaluations](../requirements/research/import-evaluations.md).
- Follow [repository validation](../../README.md#validation) for implementation changes. Provider adoption remains a separate approved decision.
