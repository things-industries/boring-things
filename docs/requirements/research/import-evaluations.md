# Import evaluations

Dated measurements on public or synthetic sources. Each report states its coverage and limits.

## Evaluation method

- Measure quality, median and tail latency, failure rate and full-task cost for each Import stage, including tool and retrieval costs, retries and checkpoint reuse. Record input sizes and source coverage, model and provider versions, prompt and schema versions, request counts, tokens, latency and measured or dated estimated costs.
- Use labelled synthetic or redacted fixtures. Include ambiguous and duplicate instances, unrelated attachments, conflicting user values, long and multilingual sources, family manuals and future multi-Thing imports. Score candidate recall and precision, incorrect merges, fieldset and field selection, unwanted custom fields, provenance, resource applicability, retrieval success and suggestion compatibility. Incorrect instance merges and private-data exposure block adoption.
- Compare configurations on the same full tasks, including validation, retry and fallback. Set thresholds in advance and use held-out data for the adoption decision. Compare page-aware batches and reuse with a separate identity pass when testing time to first Thing. Record omitted source regions so partial scans cannot be mistaken for complete coverage.
- Evaluate models by task. Candidates include smaller models for extraction and mapping, Jev for decisions over supplied evidence, and Firecrawl for retrieval. Review schema fit, citations, privacy, retention, regional availability and failure handling before selecting a provider. See the [research sources](sources.md#import-provider-evaluation--4-october-2026).
- Run offline fixtures separately. Follow [metered AI validation](../../agents/agent-behaviour.md#metered-ai-validation) for paid evaluations and use the [observability guide](../../setup/observability.md) to collect request counts and costs.

## PDF text validation

On 5 October 2026, the [Samsung RF65A967FS9 multilingual manual](https://org.downloadcenter.samsung.com/downloadfile/ContentsFile.aspx?CDSite=UNI_UK&OriginYN=N&ModelType=N&ModelName=RF65A967FS9&CttFileID=8203148&CDCttType=UM&VPath=UM%2F202106%2F20210629104532259%2FT-TYPE_RF9000A_DA68-04023P-01_EN_IT_ES_PT_EL.pdf) (45,792,215 bytes, 428 pages) produced 533,312 characters of page-labelled text in about 1.9 seconds. A mocked provider check confirmed one text request and preservation of the full extraction through application validation. No live model request was made; fact recall, multilingual deduplication and table interpretation remain unmeasured.

## Fact selection evaluation

On 4 October 2026, one live `gpt-5.6-sol` run over a labelled synthetic Neff hob fixture passed all three expected decisions: Z-number `0015` mapped to `appliances.neff` / `appliances.zNumber`, installer reference `ABC-12` retained as a custom field, and unexplained marking `V/C` discarded. Application validation accepted the complete response and preserved the identifier's leading zeroes.

The run used one read-only registry search and two model requests, totalling 4,847 input tokens (2,094 cached), 199 output tokens and 6.2 seconds of provider request time. Results and usage are saved locally in ignored `test-results/fact-selection-evaluation.json`. This checks one fact-mapping batch; broader usefulness, extraction and full-import quality remain unmeasured.

## Reference extraction model evaluation

The comparison required all six supported values, correct applicability for all four documents, no incorrect values and verbatim quotes on the labelled pages. It covered a family manual, a typed specification (zero, false, empty text and money), a policy version and an incompatible variant. Two fixtures were PDFs and two were text. Image quality was unmeasured.

Measured on 4 October 2026, one run per model over the same four documents:

| Model          | Fixtures passed | Supported-field recall | Incorrect values | Citation errors | Total latency | Estimated task cost (USD) |
| -------------- | --------------- | ---------------------- | ---------------- | --------------- | ------------- | ------------------------- |
| `gpt-5.6-sol`  | 4/4             | 100%                   | 0                | 0               | 10.8 s        | $0.022344                 |
| `gpt-5.4-mini` | 3/4             | 33%                    | 0                | 0               | 4.8 s         | $0.003093                 |
| `gpt-4.1-mini` | 4/4             | 100%                   | 0                | 0               | 7.1 s         | $0.001686                 |

`gpt-5.4-mini` rejected the applicable typed specification, omitting four values. `gpt-4.1-mini` was the cheapest passing model in this sample. This baseline measures contained extraction; retrieval success, full-import cost, image quality and broader document coverage remain unmeasured. The current task choices have not been evaluated against this baseline. Costs use the standard rates on the official [Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol), [5.4 Mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini) and [4.1 Mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini) pages, with input images included in provider token usage. All 12 requests completed without retries.
