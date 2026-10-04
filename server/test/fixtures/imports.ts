import type {
  ExtractedThing,
  Extraction,
  ImportAi,
  MappingSession,
  MappingValue,
  Source,
  RegistryTools,
  AiContext,
} from '../../src/application/import/types.js';
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
  appliances: ['appliances.neff'],
  vehicles: ['vehicles.van'],
  insurance: ['insurance.combined'],
};
export const extractionBaseline = Object.entries(extractedThings).map(([id, expected]) => ({
  id,
  source: [expected.name, ...expected.facts.map((fact) => fact.quote)].join('\n'),
  expected,
}));
export class FixtureAi implements ImportAi {
  metadata?: Extraction['metadata'];
  failOnce = false;
  arbitraryId = false;
  exhaustTools = false;
  pause?: Promise<void>;
  async extract(source: Source): Promise<Extraction> {
    const name = source.mediaType === 'text/plain' ? source.content.toString() : 'neff';
    if (name === 'bad') throw new Error('synthetic extraction failure');
    const chosen =
      name === 'two'
        ? [extractedThings.neff, { ...extractedThings.policy, id: 'candidate-2' }]
        : [extractedThings[name] ?? extractedThings.neff];
    return structuredClone({
      text: name,
      extractedThings: chosen,
      ...(this.metadata ? { metadata: this.metadata } : {}),
    });
  }
  async selectFieldSets(
    candidate: ExtractedThing,
    tools: RegistryTools,
    context: AiContext,
  ): Promise<MappingSession> {
    await tools.searchFieldSets(candidate.categoryId, candidate.terms);
    return {
      setIds: this.arbitraryId ? ['invented.set'] : sets[candidate.categoryId],
      mapFactBatch: async () => {
        if (this.pause) await this.pause;
        if (this.exhaustTools)
          for (let i = 0; i < 5; i++)
            await tools.searchFields([{ label: 'Installer reference', context: '' }]);
        if (this.failOnce) {
          this.failOnce = false;
          throw new Error('synthetic interrupted mapping');
        }
        const values: MappingValue[] =
          candidate.categoryId === 'appliances'
            ? [
                {
                  factId: 'fact-1',
                  fieldSetId: 'appliances.neff',
                  fieldId: 'appliances.zNumber',
                  value: '0015',
                  pin: true,
                },
              ]
            : candidate.categoryId === 'vehicles'
              ? [
                  {
                    factId: 'fact-1',
                    fieldSetId: 'vehicles.van',
                    fieldId: 'vehicles.payloadKg',
                    value: 1200,
                    pin: true,
                  },
                ]
              : ['buildings', 'contents'].map((part, i) => ({
                  factId: `fact-${i + 1}`,
                  fieldSetId: `insurance.${part}`,
                  fieldId: 'insurance.sumInsured',
                  value: candidate.facts[i].value,
                  pin: false,
                }));
        await context.record({
          inputTokens: 100,
          outputTokens: 30,
          cachedTokens: 20,
          model: 'fixture',
        });

        if (candidate.categoryId === 'appliances')
          await tools.searchFields([{ label: 'Installer reference', context: '' }]);
        return { values };
      },
    };
  }
  async extractDocument() {
    return { applicable: false, applicability: null, values: [] };
  }
  async discover() {
    return { items: [], sources: [] };
  }
}
