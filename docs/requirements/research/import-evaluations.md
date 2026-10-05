# Import evaluations

Dated measurements on public or synthetic sources. Each report states its coverage and limits.

## PDF text validation

On 5 October 2026, the [Samsung RF65A967FS9 multilingual manual](https://org.downloadcenter.samsung.com/downloadfile/ContentsFile.aspx?CDSite=UNI_UK&OriginYN=N&ModelType=N&ModelName=RF65A967FS9&CttFileID=8203148&CDCttType=UM&VPath=UM%2F202106%2F20210629104532259%2FT-TYPE_RF9000A_DA68-04023P-01_EN_IT_ES_PT_EL.pdf) (45,792,215 bytes, 428 pages) produced 533,312 characters of page-labelled text in about 1.9 seconds. A mocked provider check confirmed one text request and preservation of the full extraction through application validation. No live model request was made; fact recall, multilingual deduplication and table interpretation remain unmeasured.

## Fact selection evaluation

On 4 October 2026, one live `gpt-5.6-sol` run over a labelled synthetic Neff hob fixture passed all three expected decisions: Z-number `0015` mapped to `appliances.neff` / `appliances.zNumber`, installer reference `ABC-12` retained as a custom field, and unexplained marking `V/C` discarded. Application validation accepted the complete response and preserved the identifier's leading zeroes.

The run used one read-only registry search and two model requests, totalling 4,847 input tokens (2,094 cached), 199 output tokens and 6.2 seconds of provider request time. Results and usage are saved locally in ignored `test-results/fact-selection-evaluation.json`. This checks one fact-mapping batch; broader usefulness, extraction and full-import quality remain unmeasured.

## Reference extraction model evaluation

`DOCUMENT_EXTRACTION_MODEL` independently selects the contained task's model and defaults to `OPENAI_MODEL`. Model defaults remain unchanged. Text and image inputs and Responses structured outputs are supported by the compared models; [OpenAI file-input guidance](https://developers.openai.com/api/docs/guides/file-inputs) describes PDF text and page-image processing.

Run `node --import tsx --env-file=.env scripts/evaluate-document-extraction.ts` for a **paid** comparison on [labelled synthetic fixtures](../../../server/test/fixtures/reference-documents.ts). `--models=model-a,model-b` selects models; `DOCUMENT_EVAL_RATES` supplies USD-per-million input, cached and output rates for additional models. Results, per-task usage, latency and cost including retries are saved in ignored `test-results/document-extraction-evaluation.json`.

The baseline requires all six supported values, correct applicability for all four documents, no incorrect values and verbatim quotes on the labelled pages. It covers a family manual, a typed specification (zero, false, empty text and money), a policy version and an incompatible variant. Two fixtures are PDFs and two are text. Image extraction capability is documented; image quality is unmeasured.

Measured on 4 October 2026, one run per model over the same four documents:

| Model          | Fixtures passed | Supported-field recall | Incorrect values | Citation errors | Total latency | Estimated task cost (USD) |
| -------------- | --------------- | ---------------------- | ---------------- | --------------- | ------------- | ------------------------- |
| `gpt-5.6-sol`  | 4/4             | 100%                   | 0                | 0               | 10.8 s        | $0.022344                 |
| `gpt-5.4-mini` | 3/4             | 33%                    | 0                | 0               | 4.8 s         | $0.003093                 |
| `gpt-4.1-mini` | 4/4             | 100%                   | 0                | 0               | 7.1 s         | $0.001686                 |

`gpt-5.4-mini` rejected the applicable typed specification, omitting four values. `gpt-4.1-mini` was the cheapest passing model in this sample; configure `DOCUMENT_EXTRACTION_MODEL=gpt-4.1-mini` to use it. This baseline measures contained extraction; retrieval success, full-import cost, image quality and broader document coverage remain unmeasured. Defaults require broader evaluation before changing. Costs use the standard rates on the official [Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol), [5.4 Mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini) and [4.1 Mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini) pages, with input images included in provider token usage. All 12 requests completed without retries.
