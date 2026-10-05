import { publicFields } from '../public-fields.js';
/**
 * Validates extracted facts and maps them into Thing fields while preserving provenance, sensitive
 * values and user edits.
 */

import { createHash } from 'node:crypto';
import type { ExtractedThing, Extraction, FactMapping, Fact, ResearchThing } from './types.js';
import type { Registry } from '../registry/registry.js';
import type { ThingData, StoredValue } from '../../../../shared/model.js';
import { ensure } from '../errors.js';
import { schemaValidator } from '../../contracts/schemas.js';
import { validateAttachmentMetadata } from '../attachments.js';
import { maxDocumentTextLength } from '../../lib/document-limits.js';
const valueValidator = schemaValidator('Value');

export function validateExtraction(input: Extraction, categories: string[]): Extraction {
  ensure(
    input &&
      typeof input.text === 'string' &&
      input.text.length <= maxDocumentTextLength &&
      Array.isArray(input.extractedThings) &&
      input.extractedThings.length > 0 &&
      input.extractedThings.length <= 10,
    'Invalid extraction',
  );

  return {
    text: input.text,
    ...(input.metadata ? { metadata: validateAttachmentMetadata(input.metadata) } : {}),
    extractedThings: input.extractedThings.map((c, i) => {
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
        name: c.name,
        categoryId: c.categoryId,
        terms: c.terms,
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

export function applySelectedSets(
  original: ThingData,
  setIds: string[],
  category: string,
  registry: Registry,
  allowedSets: Set<string>,
): ThingData {
  ensure(setIds.length <= 30 && setIds.every((id) => allowedSets.has(id)), 'Unretrieved field set');
  const selected = registry
    .expand(setIds, category)
    .filter((id) => !original.userEdited?.includes(`set:${id}`));
  return { ...original, setIds: registry.expand([...original.setIds, ...selected], category) };
}

export function applyFactMapping(
  original: ThingData,
  batch: FactMapping,
  candidate: Pick<ExtractedThing, 'id' | 'facts'>,
  registry: Registry,
  allowedFields: Set<string>,
  jobId: string,
  attachmentId: string,
): ThingData {
  const ids = [
    ...new Set(batch.values.map((entry) => entry.factId)),
    ...batch.customFactIds,
    ...batch.discardedFactIds,
  ];
  ensure(
    batch.values.length <= 100 &&
      ids.length === candidate.facts.length &&
      new Set(ids).size === ids.length &&
      candidate.facts.every((fact) => ids.includes(fact.id)),
    'Incomplete or conflicting fact dispositions',
  );
  const data = structuredClone(original);
  const addresses = new Set<string>();
  for (const fact of candidate.facts) {
    const id = localFactId(jobId, candidate.id, fact.id);
    const localEdited =
      data.userEdited?.includes(`local:${id}`) ||
      data.customFields.some((field) => field.id === id && field.origin === 'USER');
    if (!localEdited)
      data.customFields = data.customFields.filter(
        (field) => field.id !== id || field.origin !== 'IMPORT',
      );
    const stored: StoredValue = {
      value: fact.value,
      origin: 'IMPORT',
      sourceRefs: [
        {
          attachmentId,
          ...(fact.page ? { page: fact.page } : {}),
          ...(fact.quote ? { quote: fact.quote } : {}),
        },
      ],
    };
    const sensitive = sensitiveFact(fact, registry);
    let custom = batch.customFactIds.includes(fact.id);
    for (const entry of batch.values.filter((value) => value.factId === fact.id)) {
      const definition = registry.fields.get(entry.fieldId);
      ensure(definition && allowedFields.has(entry.fieldId), 'Unknown mapped field');
      ensure(!sensitive || definition.sensitive, 'Sensitive fact requires a sensitive field');
      if (entry.fieldSetId !== null)
        ensure(
          data.setIds.includes(entry.fieldSetId) &&
            registry.sets.get(entry.fieldSetId)?.fields.some((field) => field.id === entry.fieldId),
          'Invalid field membership',
        );
      registry.validate(entry.fieldId, entry.value);
      const key = `${entry.fieldSetId ?? ''}:${entry.fieldId}`;
      const address = `${fact.id}:${key}`;
      ensure(!addresses.has(address), 'Duplicate fact mapping');
      addresses.add(address);
      if (localEdited) continue;
      const target =
        entry.fieldSetId === null ? data.standalone : (data.values[entry.fieldSetId] ??= {});
      if (
        data.userEdited?.includes(key) ||
        target[entry.fieldId]?.origin === 'USER' ||
        (target[entry.fieldId] &&
          JSON.stringify(target[entry.fieldId].value) !== JSON.stringify(entry.value))
      ) {
        custom = true;
        continue;
      }
      target[entry.fieldId] = { ...stored, value: entry.value };
      if (
        entry.pin &&
        !definition.sensitive &&
        data.pins.length < 3 &&
        !data.userEdited?.includes('pins') &&
        !data.pins.some(
          (pin) => pin.fieldSetId === entry.fieldSetId && pin.fieldId === entry.fieldId,
        )
      )
        data.pins.push({ fieldSetId: entry.fieldSetId, fieldId: entry.fieldId });
    }
    if (custom && !localEdited && !data.customFields.some((field) => field.id === id))
      data.customFields.push({
        ...stored,
        id,
        label: fact.label,
        sensitive,
      });
  }
  return data;
}

export function buildResearchThing(
  subject: Pick<ExtractedThing, 'id' | 'categoryId'>,
  data: ThingData,
  registry: Registry,
): ResearchThing | null {
  const fields = publicFields(data, registry);
  const targets: ResearchThing['emptyFields'] = [];
  const add = (fieldSetId: string | null, fieldId: string, stored?: StoredValue) => {
    const definition = registry.fields.get(fieldId);
    if (
      !definition ||
      definition.instanceSpecific !== false ||
      stored?.value != null ||
      data.userEdited?.includes(`${fieldSetId ?? ''}:${fieldId}`)
    )
      return;
    targets.push({
      fieldSetId,
      fieldId,
      label: definition.name,
      description: definition.description,
      schema: definition.schema,
    });
  };
  for (const setId of data.setIds)
    for (const field of registry.sets.get(setId)?.fields ?? [])
      add(setId, field.id, data.values[setId]?.[field.id]);
  for (const [id, stored] of Object.entries(data.standalone)) add(null, id, stored);
  if (!fields.length) return null;
  return {
    id: subject.id,
    categoryId: subject.categoryId,
    knownFields: fields,
    emptyFields: targets,
  };
}
