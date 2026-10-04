// Paid evaluation using labelled synthetic documents; no application records are accessed.
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { readConfig } from '../server/src/config.js';
import { OpenAiImports } from '../server/src/providers/ai/openai-imports.js';
import { Registry } from '../server/src/application/registry/registry.js';
import { validateDocumentExtraction } from '../server/src/application/import/research.js';
import type { DocumentExtraction, Usage } from '../server/src/application/import/types.js';
import {
  referenceDocumentBaseline,
  referenceFields,
  referenceSet,
} from '../server/test/fixtures/reference-documents.js';

const config = readConfig();
assert.ok(config.openaiApiKey && config.openaiModel, 'Set OPENAI_API_KEY and OPENAI_MODEL');
const models = [
  ...new Set(
    (
      process.argv.find((arg) => arg.startsWith('--models='))?.slice(9) ??
      `${config.openaiModel},gpt-5.4-mini`
    ).split(','),
  ),
];
// Standard USD rates per million tokens, checked on 4 October 2026. Override for other models.
const rates: Record<string, { input: number; cached: number; output: number }> = {
  'gpt-5.6-sol': { input: 4, cached: 0.4, output: 20 },
  'gpt-5.4-mini': { input: 0.75, cached: 0.075, output: 4.5 },
  'gpt-4.1-mini': { input: 0.4, cached: 0.1, output: 1.6 },
  ...JSON.parse(process.env.DOCUMENT_EVAL_RATES ?? '{}'),
};
for (const model of models) assert.ok(rates[model], `Supply DOCUMENT_EVAL_RATES for ${model}`);
const registry = new Registry(referenceFields, [referenceSet]);
const results: Record<string, unknown>[] = [];
for (const model of models) {
  const ai = new OpenAiImports(config.openaiApiKey, config.openaiModel, 4000, 3, model);
  for (const fixture of referenceDocumentBaseline) {
    const usage: NonNullable<Usage['entries']> = [];
    let content = Buffer.from(fixture.pages.join('\n'));
    if (fixture.mediaType === 'application/pdf') {
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      for (const text of fixture.pages) {
        const page = pdf.addPage();
        page.drawText(text, { x: 40, y: 750, size: 11, font, maxWidth: 510, lineHeight: 18 });
      }
      content = Buffer.from(await pdf.save());
    }
    const document = {
      attachmentId: fixture.id,
      url: 'https://example.com/' + fixture.id,
      filename: fixture.id + (fixture.mediaType === 'application/pdf' ? '.pdf' : '.txt'),
      mediaType: fixture.mediaType,
      content,
      pageCount: fixture.pages.length,
    };
    const started = Date.now();
    let result: DocumentExtraction | undefined;
    let failure: string | undefined;
    let attempts = 0;
    for (; attempts < 2; attempts++) {
      try {
        result = await ai.extractDocument(document, fixture.research, fixture.research.targets, {
          signal: AbortSignal.timeout(90000),
          record: async (delta) => {
            usage.push(...(delta.entries ?? []));
          },
        });
        validateDocumentExtraction(result, document, fixture.research.targets, registry);
        break;
      } catch (error) {
        failure = error instanceof Error ? error.message : 'failed';
      }
    }
    const values = result?.values ?? [];
    const correct = values.filter((entry) =>
      isDeepStrictEqual(
        entry.value,
        fixture.expected[entry.fieldId as keyof typeof fixture.expected],
      ),
    );
    const citationErrors = values.filter(
      (entry) => !fixture.pages[entry.page - 1]?.includes(entry.quote),
    ).length;
    const expectedCount = Object.keys(fixture.expected).length;
    const passed = Boolean(
      result &&
      result.applicable === fixture.applicable &&
      correct.length === expectedCount &&
      values.length === expectedCount &&
      citationErrors === 0 &&
      (!result.applicable ||
        fixture.pages[result.applicability!.page - 1].includes(result.applicability!.quote)),
    );
    const rate = rates[model];
    const costUsd = usage.reduce(
      (sum, entry) =>
        sum +
        ((entry.inputTokens - entry.cachedTokens) * rate.input +
          entry.cachedTokens * rate.cached +
          entry.outputTokens * rate.output) /
          1000000,
      0,
    );
    const record = {
      model,
      fixture: fixture.id,
      passed,
      attempts: Math.min(attempts + 1, 2),
      expectedCount,
      correctCount: correct.length,
      incorrectCount: values.length - correct.length,
      citationErrors,
      elapsedMs: Date.now() - started,
      costUsd,
      usage,
      result,
      ...(result ? {} : { failure }),
    };
    results.push(record);
    console.log(
      JSON.stringify({ model, fixture: fixture.id, passed, elapsedMs: record.elapsedMs, costUsd }),
    );
  }
}
await mkdir('test-results', { recursive: true });
await writeFile(
  'test-results/document-extraction-evaluation.json',
  JSON.stringify(
    {
      date: '2026-10-04',
      thresholds: { supportedRecall: 1, precision: 1, citationAccuracy: 1, variantErrors: 0 },
      rates,
      results,
    },
    null,
    2,
  ),
);
if (results.some((result) => !result.passed)) process.exitCode = 1;
