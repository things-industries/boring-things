/** Supplies synthetic Import results for application and browser checks without external AI calls. */

import { pauseUntil } from './pause.js';
import type {
  ExtractedThing,
  Extraction,
  ImportAi,
  ImportTaskContext,
} from '../../src/application/import/types.js';
import { searchFields, searchFieldSets } from '../../src/providers/ai/tools/registry.js';
import type { RegistryResources } from '../../src/providers/ai/types.js';
import { searchTranscription } from '../../src/providers/ai/tools/transcription.js';
type PopulationResult = Awaited<ReturnType<NonNullable<ImportAi['populateFields']>>>;

// Synthetic replay fixtures. Live provider observations are recorded separately by the smoke script.
const fact = (
  id: string,
  label: string,
  value: string | number | { amountMinor: number; currency: 'GBP' },
) => ({
  id,
  label,
  value,
  quote: `${label}: ${typeof value === 'object' ? JSON.stringify(value) : value}`,
  page: null,
  sensitive: false,
});
export const extractedThings: Record<string, ExtractedThing> = {
  neff: {
    id: 'candidate-1',
    name: 'Neff hob',
    categoryId: 'appliances',
    terms: ['Neff'],
    facts: [fact('fact-1', 'Z-Nr', '0015'), fact('fact-2', 'Installer reference', 'ABC-12')],
  },
  van: {
    id: 'candidate-1',
    name: 'Cargo van',
    categoryId: 'vehicles',
    terms: ['van'],
    facts: [fact('fact-1', 'Load capacity', 1200)],
  },
  policy: {
    id: 'candidate-1',
    name: 'Combined policy',
    categoryId: 'insurance',
    terms: ['combined'],
    facts: [
      fact('fact-1', 'Buildings sum insured', {
        amountMinor: 40000000,
        currency: 'GBP',
      }),
      fact('fact-2', 'Contents sum insured', {
        amountMinor: 5000000,
        currency: 'GBP',
      }),
    ],
  },
};
const sets: Record<string, string[]> = {
  appliances: ['appliances.appliance'],
  vehicles: ['vehicles.van'],
  insurance: ['insurance.combined'],
};
export const extractionBaseline = Object.entries(extractedThings).map(([id, expected]) => ({
  id,
  source: [expected.name, ...expected.facts.map((fact) => fact.quote)].join('\n'),
  expected,
}));
export class FixtureAi implements ImportAi {
  constructor(private registryResources: RegistryResources) {}

  metadata?: Extraction['metadata'];
  failOnce = false;
  arbitraryId = false;
  pause?: Promise<void>;

  async summarizeAttachment(text: string) {
    return {
      summary: `Source for ${text}`,
      terms: text.toLowerCase().includes('neff')
        ? ['neff']
        : text.includes('warranty')
          ? ['warranty']
          : text.includes('van')
            ? ['van']
            : ['source'],
      status: (text === 'non-english' ? 'INSUFFICIENT_LANGUAGE' : 'COMPLETE') as
        'COMPLETE' | 'INSUFFICIENT_LANGUAGE',
      metadata: this.metadata ?? null,
      identifiers: [],
    };
  }

  async resolveThing(
    input: import('../../src/application/import/types.js').ResolutionInput,
    context: ImportTaskContext,
  ) {
    const source = input.sources[0];
    if (!source) return { candidates: [], contradiction: false };
    const evidence = await searchTranscription(context, source.attachmentId, '', 0);
    const text = evidence.text.toLowerCase();
    const categoryId = text.includes('policy')
      ? 'insurance'
      : text.includes('van')
        ? 'vehicles'
        : 'appliances';
    const contextual = input.existingThings.find((thing) => thing.id === input.thingContextId);
    if (text.includes('nonsense') || text === 'non-english')
      return { candidates: [], contradiction: false };
    const identifiers = text.includes('model-only')
      ? [
          {
            fieldId: 'common.model',
            value: 'X1',
            attachmentId: source.attachmentId,
            page: null,
            quote: evidence.text,
          },
        ]
      : [];
    return {
      contradiction: !!contextual && text.includes('wrong'),
      candidates: [
        {
          name:
            contextual?.name ??
            (categoryId === 'vehicles'
              ? 'Cargo van'
              : categoryId === 'insurance'
                ? 'Policy'
                : 'Neff oven'),
          categoryId: contextual?.categoryId ?? categoryId,
          terms: source.terms,
          identifiers,
          attachmentIds: [source.attachmentId],
          strength: 1,
          matchedThingId:
            contextual?.id ??
            input.existingThings.find((thing) =>
              identifiers.some((identifier) =>
                thing.identifiers.some(
                  (entry) =>
                    entry.fieldId === identifier.fieldId && entry.value === identifier.value,
                ),
              ),
            )?.id ??
            null,
        },
      ],
    };
  }

  async populateFields(
    input: import('../../src/application/import/types.js').PopulationInput,
    context: ImportTaskContext,
  ): Promise<PopulationResult> {
    await pauseUntil(this.pause, context.signal);
    if (this.failOnce) {
      this.failOnce = false;
      throw new Error('Synthetic population failure');
    }
    const source =
      input.sources.find((source) => !source.summary?.includes('public-manual')) ??
      input.sources[0];
    if (!source) return { values: [], pinnedFields: [] };
    const evidence = await searchTranscription(context, source.attachmentId, '', 0);
    return {
      pinnedFields: input.fields
        .filter((target) => ['appliances.zNumber', 'vehicles.payloadKg'].includes(target.field.id))
        .map((target) => ({ fieldSetId: target.fieldSetId, fieldId: target.field.id })),
      values: input.fields.flatMap<PopulationResult['values'][number]>((target) =>
        target.field.id === 'appliances.zNumber' && !source.summary?.includes('public-manual')
          ? [
              {
                fieldSetId: target.fieldSetId,
                fieldId: target.field.id,
                value: '0015',
                sourceRefs: [{ attachmentId: source.attachmentId, quote: evidence.text }],
              },
            ]
          : target.field.id === 'insurance.sumInsured' && input.thing.categoryId === 'insurance'
            ? [
                {
                  fieldSetId: target.fieldSetId,
                  fieldId: target.field.id,
                  value: {
                    amountMinor: target.fieldSetId === 'insurance.buildings' ? 40000000 : 5000000,
                    currency: 'GBP' as const,
                  },
                  sourceRefs: [{ attachmentId: source.attachmentId, quote: evidence.text }],
                },
              ]
            : target.field.id === 'vehicles.payloadKg' && input.thing.categoryId === 'vehicles'
              ? [
                  {
                    fieldSetId: target.fieldSetId,
                    fieldId: target.field.id,
                    value: 1200,
                    sourceRefs: [{ attachmentId: source.attachmentId, quote: evidence.text }],
                  },
                ]
              : target.field.id === 'common.warrantyEnds' && evidence.text.includes('warranty')
                ? [
                    {
                      fieldSetId: target.fieldSetId,
                      fieldId: target.field.id,
                      value: '2030-01-01',
                      sourceRefs: [{ attachmentId: source.attachmentId, quote: evidence.text }],
                    },
                  ]
                : [],
      ),
    };
  }

  async assessResource(): Promise<Awaited<ReturnType<NonNullable<ImportAi['assessResource']>>>> {
    return { applicable: true, identifiers: [] };
  }
  async additionalInformation(
    input: import('../../src/application/import/types.js').AdditionalInformationInput,
    context: ImportTaskContext,
  ) {
    if (input.text !== 'neff' || input.knownFields.includes('Installer reference'))
      return { findings: [] };
    await searchFields(context, this.registryResources, [
      { label: 'Installer reference', context: '' },
    ]);
    return {
      findings: [
        {
          label: 'Installer reference',
          fieldId: null,
          value: 'ABC-12',
          sensitive: false,
          reason: 'Fixture administration reference',
          attachmentId: input.attachmentId,
          page: null,
          quote: input.text,
        },
      ],
    };
  }

  async selectFieldSets(candidate: ExtractedThing, context: ImportTaskContext) {
    await searchFieldSets(
      context,
      this.registryResources,
      candidate.categoryId,
      candidate.terms.length ? candidate.terms : [candidate.name],
    );
    return { setIds: this.arbitraryId ? ['invented.set'] : sets[candidate.categoryId] };
  }
  async findResources(): Promise<Awaited<ReturnType<ImportAi['findResources']>>> {
    return { items: [], sources: [] };
  }
  async suggestTasks(
    _input: Parameters<ImportAi['suggestTasks']>[0],
    _context: ImportTaskContext,
  ): Promise<Awaited<ReturnType<ImportAi['suggestTasks']>>> {
    return { items: [] };
  }
  async findPurchasables(
    _input: Parameters<ImportAi['findPurchasables']>[0],
    _context: ImportTaskContext,
  ): Promise<Awaited<ReturnType<ImportAi['findPurchasables']>>> {
    return { items: [] };
  }
}
