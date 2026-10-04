/**
 * Validates extracted facts and maps them into Thing fields while preserving provenance, sensitive
 * values and user edits.
 */

import { createHash } from 'node:crypto';
import type { ExtractedThing, Extraction, MappingStage, Fact, ResearchContext } from './types.js';
import type { Registry } from '../registry/registry.js';
import type { ThingData, StoredValue } from '../../../../shared/model.js';
import { ensure } from '../errors.js';
import { schemaValidator } from '../../contracts/schemas.js';
import { validateAttachmentMetadata } from '../attachments.js';
const valueValidator = schemaValidator('Value');

export function validateExtraction(input: Extraction, categories: string[]): Extraction {
  ensure(
    input &&
      typeof input.text === 'string' &&
      input.text.length <= 200000 &&
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
  candidate: ExtractedThing,
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
        target[entry.fieldId]?.origin !== 'USER'
      ) {
        const stored: StoredValue = {
          value: entry.value,
          origin: 'IMPORT',
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
            (f) => f.id !== localId || f.origin === 'USER',
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
  candidate: ExtractedThing,
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
        origin: 'IMPORT',
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

export function buildResearchContext(
  subject: Pick<ExtractedThing, 'id' | 'categoryId'>,
  data: ThingData,
  registry: Registry,
): ResearchContext | null {
  const fields: ResearchContext['fields'] = [];
  const targets: ResearchContext['targets'] = [];
  const add = (fieldSetId: string | null, fieldId: string, stored?: StoredValue) => {
    const definition = registry.fields.get(fieldId);
    if (!definition || definition.instanceSpecific !== false) return;
    const field = {
      fieldSetId,
      fieldId,
      label: definition.name,
      description: definition.description,
    };
    if (stored && stored.value !== null && stored.value !== undefined)
      fields.push({ ...field, value: stored.value });
    else if (!data.userEdited?.includes(`${fieldSetId ?? ''}:${fieldId}`))
      targets.push({ ...field, schema: definition.schema });
  };
  for (const setId of data.setIds)
    for (const field of registry.sets.get(setId)?.fields ?? [])
      add(setId, field.id, data.values[setId]?.[field.id]);
  for (const [id, stored] of Object.entries(data.standalone)) add(null, id, stored);
  for (const field of data.undefinedFields)
    if (field.instanceSpecific === false)
      fields.push({
        fieldSetId: null,
        fieldId: field.id,
        undefinedFieldId: field.id,
        label: field.label,
        description: field.label,
        value: field.value,
      });
  if (!fields.length) return null;
  return {
    id: subject.id,
    categoryId: subject.categoryId,
    name: [
      ...new Set(
        fields.map((f) => (typeof f.value === 'string' ? f.value : JSON.stringify(f.value))),
      ),
    ].join(' '),
    fields,
    targets,
  };
}
