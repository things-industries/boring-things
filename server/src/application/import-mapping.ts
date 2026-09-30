/**
 * Validates extracted facts and maps them into Thing fields while preserving provenance, sensitive
 * values and user edits.
 */

import { createHash } from 'node:crypto';
import { Ajv } from 'ajv';
import type { Candidate, Extraction, MappingStage, Fact } from './import-types.js';
import type { Registry } from './registry.js';
import type { ThingData, StoredValue } from '../../../shared/model.js';
import { ensure } from './errors.js';
import spec from '../../../openapi.json' with { type: 'json' };

const valueValidator = new Ajv({ strict: false }).compile({
  ...spec.components.schemas.Value,
  definitions: { Money: spec.components.schemas.Money },
  oneOf: spec.components.schemas.Value.oneOf.map((s) =>
    '$ref' in s ? { $ref: '#/definitions/Money' } : s,
  ),
});

export function validateExtraction(input: Extraction, categories: string[]): Extraction {
  ensure(
    input &&
      typeof input.text === 'string' &&
      input.text.length <= 200000 &&
      Array.isArray(input.candidates) &&
      input.candidates.length > 0 &&
      input.candidates.length <= 10,
    'Invalid extraction',
  );

  return {
    text: input.text,
    candidates: input.candidates.map((c, i) => {
      ensure(
        typeof c.name === 'string' &&
          c.name.trim().length > 0 &&
          c.name.length <= 200 &&
          categories.includes(c.categoryId),
        'Invalid extracted candidate',
      );
      ensure(
        Array.isArray(c.terms) &&
          c.terms.length <= 20 &&
          c.terms.every((t) => typeof t === 'string' && t.length <= 200),
        'Invalid candidate terms',
      );
      ensure(Array.isArray(c.facts) && c.facts.length <= 100, 'Too many extracted facts');
      return {
        ...c,
        id: `candidate-${i + 1}`,
        facts: c.facts.map((f, n) => {
          ensure(
            typeof f.label === 'string' &&
              f.label.length > 0 &&
              f.label.length <= 200 &&
              valueValidator(f.value) &&
              typeof f.quote === 'string' &&
              f.quote.length <= 2000 &&
              typeof f.sensitive === 'boolean' &&
              (f.page === null || (Number.isInteger(f.page) && f.page > 0)),
            'Invalid extracted fact',
          );

          return { ...f, id: `fact-${n + 1}` };
        }),
      };
    }),
  };
}

function sensitiveFact(fact: Fact, registry?: Registry) {
  const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

  const label = normalize(fact.label);
  return (
    fact.sensitive ||
    /password|passcode|accesspin|securitycode|secret|accesscode/.test(label) ||
    [...(registry?.fields.values() ?? [])].some(
      (field) =>
        field.sensitive &&
        [field.name, field.id, ...field.keywords].some((term) => normalize(term) === label),
    )
  );
}

// Derive stable local IDs from the import, candidate and fact so retries reuse custom fields and their edit markers.
export function localFactId(jobId: string, candidateId: string, factId: string) {
  const hash = createHash('sha256').update(`${jobId}:${candidateId}:${factId}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function applyImportStage(
  original: ThingData,
  stage: MappingStage,
  candidate: Candidate,
  category: string,
  registry: Registry,
  allowedSets: Set<string>,
  allowedFields: Set<string>,
  jobId: string,
  attachmentId: string,
): ThingData {
  const data = structuredClone(original);

  if (stage.kind === 'sets') {
    ensure(
      stage.setIds.length <= 30 && stage.setIds.every((id) => allowedSets.has(id)),
      'Unretrieved field set',
    );
    const selected = registry
      .expand(stage.setIds, category)
      .filter((id) => !data.userEdited?.includes(`set:${id}`));
    data.setIds = registry.expand([...data.setIds, ...selected], category);
  } else {
    ensure(stage.values.length <= 100, 'Too many mapped values');

    for (const entry of stage.values) {
      const fact = candidate.facts.find((f) => f.id === entry.factId);
      ensure(fact && allowedFields.has(entry.fieldId), 'Unknown mapped fact or field');
      const definition = registry.fields.get(entry.fieldId);
      ensure(
        definition && (!sensitiveFact(fact, registry) || definition.sensitive),
        'Sensitive fact requires a sensitive field',
      );

      if (entry.fieldSetId !== null)
        ensure(
          data.setIds.includes(entry.fieldSetId) &&
            registry.sets.get(entry.fieldSetId)?.fields.some((f) => f.id === entry.fieldId),
          'Invalid field membership',
        );

      registry.validate(entry.fieldId, entry.value);

      // An identifier-like string cannot silently become a number.
      if (typeof fact.value === 'string' && definition.schema.type === 'string')
        ensure(
          typeof entry.value === 'string' && entry.value === fact.value,
          'Text and identifiers must preserve the extracted value',
        );

      const key = `${entry.fieldSetId ?? ''}:${entry.fieldId}`;
      const target =
        entry.fieldSetId === null ? data.standalone : (data.values[entry.fieldSetId] ??= {});
      const localId = localFactId(jobId, candidate.id, fact.id);

      // A cleared or manually edited destination stays under owner control, including edits to its retained custom fact.
      if (
        !data.userEdited?.includes(key) &&
        !data.userEdited?.includes(`local:${localId}`) &&
        target[entry.fieldId]?.origin !== 'user'
      ) {
        const stored: StoredValue = {
          value: entry.value,
          origin: 'import',
          sourceRefs: [
            {
              attachmentId,
              ...(fact.page ? { page: fact.page } : {}),
              ...(fact.quote ? { quote: fact.quote } : {}),
            },
          ],
        };

        // Repeated mapping to the same address must not collapse different facts.
        if (
          !target[entry.fieldId] ||
          JSON.stringify(target[entry.fieldId].value) === JSON.stringify(entry.value)
        ) {
          target[entry.fieldId] = stored;
          data.undefinedFields = data.undefinedFields.filter(
            (f) => f.id !== localId || f.origin === 'user',
          );

          if (
            entry.pin &&
            !definition.sensitive &&
            data.pins.length < 3 &&
            !data.userEdited?.includes('pins') &&
            !data.pins.some((p) => p.fieldSetId === entry.fieldSetId && p.fieldId === entry.fieldId)
          )
            data.pins.push({
              fieldSetId: entry.fieldSetId,
              fieldId: entry.fieldId,
            });
        }
      }
    }
  }

  return data;
}

export function retainFacts(
  original: ThingData,
  candidate: Candidate,
  jobId: string,
  attachmentId: string,
  registry?: Registry,
) {
  const data = structuredClone(original);

  for (const fact of candidate.facts) {
    const id = localFactId(jobId, candidate.id, fact.id);

    if (!data.undefinedFields.some((f) => f.id === id) && !data.userEdited?.includes(`local:${id}`))
      data.undefinedFields.push({
        id,
        label: fact.label,
        value: fact.value,
        sensitive: sensitiveFact(fact, registry),
        origin: 'import',
        sourceRefs: [
          {
            attachmentId,
            ...(fact.page ? { page: fact.page } : {}),
            ...(fact.quote ? { quote: fact.quote } : {}),
          },
        ],
      });
  }

  return data;
}

export function publicDiscoveryCandidate(candidate: Candidate, data: ThingData): Candidate | null {
  // Only public product identifiers leave this boundary for web discovery; extracted text and private facts are excluded.
  const permitted = ['common.brand', 'common.manufacturer', 'common.model', 'appliances.eNumber'];
  const values = [
    ...Object.entries(data.standalone),
    ...Object.values(data.values).flatMap((v) => Object.entries(v)),
  ].filter(([id, stored]) => permitted.includes(id) && typeof stored.value === 'string');
  if (!values.some(([id]) => ['common.model', 'appliances.eNumber'].includes(id))) return null;
  return {
    id: candidate.id,
    categoryId: candidate.categoryId,
    name: [...new Set(values.map(([, v]) => String(v.value)))].join(' '),
    terms: [],
    facts: [],
  };
}
