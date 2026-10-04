import type { FieldSearchLabel } from '../registry/registry.js';
/**
 * Defines import extraction, mapping, discovery and provider interfaces, plus shared usage tracking
 * and active job states.
 */

import type { FieldDefinition, Schema, Value } from '../../../../shared/model.js';

export interface Fact {
  id: string;
  label: string;
  value: Value;
  quote: string;
  page: number | null;
  sensitive: boolean;
}

export interface ExtractedThing {
  id: string;
  name: string;
  categoryId: string;
  terms: string[];
  facts: Fact[];
}

export interface Extraction {
  text: string;
  extractedThings: ExtractedThing[];
  metadata?: Schema['AttachmentPatch'] | null;
}

export interface Source {
  filename: string;
  mediaType: string;
  content: Buffer;
}

export interface MappingValue {
  factId: string;
  fieldSetId: string | null;
  fieldId: string;
  value: Value;
  pin: boolean;
}

export type MappingStage =
  { kind: 'sets'; setIds: string[] } | { kind: 'values'; values: MappingValue[] };

export interface DiscoveryItem {
  kind: 'reference' | 'maintenance' | 'consumable' | 'accessory' | 'upgrade';
  title: string;
  description: string;
  url: string;
  sourceUrl: string;
  metadata?: Schema['AttachmentPatch'] | null;
}

export interface Discovery {
  items: DiscoveryItem[];
  sources: string[];
  identity?: { name: string; sourceUrl: string } | null;
  researchRounds?: number;
  documentBatches?: { attachmentId: string; targetKeys: string[] }[];
  outcomes?: {
    fieldSetId: string | null;
    fieldId: string | null;
    outcome: 'found' | 'unavailable' | 'retrieval_failed' | 'budget_exhausted';
  }[];
}

export type Usage = Schema['ImportUsage'];

export interface AiContext {
  signal: AbortSignal;
  record: (usage: Partial<Usage>) => Promise<void>;
}

export interface RegistryTools {
  searchFieldSets(categoryId: string, terms: string[]): Promise<unknown>;
  searchFields(labels: FieldSearchLabel[]): Promise<unknown>;
}

export interface ResearchContext {
  id: string;
  name: string;
  categoryId: string;
  fields: ResearchField[];
  targets: ResearchTarget[];
}

export interface ResearchTarget {
  fieldSetId: string | null;
  fieldId: string;
  label: string;
  description: string;
  schema: FieldDefinition['schema'];
}

export interface ResearchField extends Omit<ResearchTarget, 'schema'> {
  undefinedFieldId?: string;
  value: Value;
}

export interface ReferenceDocument extends Source {
  attachmentId: string;
  url: string;
  pageCount: number;
}

export interface DocumentExtraction {
  applicable: boolean;
  applicability: { page: number; quote: string } | null;
  values: {
    fieldSetId: string | null;
    fieldId: string;
    value: Value;
    page: number;
    quote: string;
  }[];
}

export interface MappingSession {
  setIds: string[];
  mapFactBatch(facts: Fact[]): Promise<{ values: MappingValue[] }>;
}

export interface ImportAi {
  extract(source: Source, categories: string[], context: AiContext): Promise<Extraction>;
  selectFieldSets(
    extractedThing: ExtractedThing,
    tools: RegistryTools,
    context: AiContext,
  ): Promise<MappingSession>;
  discover(
    research: ResearchContext,
    context: AiContext,
    focus?: 'reference' | 'maintenance' | 'products',
    searchCalls?: number,
  ): Promise<Discovery>;
  extractDocument(
    document: ReferenceDocument,
    research: ResearchContext,
    targets: ResearchTarget[],
    context: AiContext,
  ): Promise<DocumentExtraction>;
}

// Awaiting selection still locks the Thing until the owner confirms which candidates to import.
export const activeStatuses = [
  'QUEUED',
  'EXTRACTING',
  'AWAITING_SELECTION',
  'MAPPING',
  'DISCOVERING',
];

export const blankUsage = (model = ''): Usage => ({
  model,
  inputTokens: 0,
  outputTokens: 0,
  cachedTokens: 0,
  elapsedMs: 0,
  toolCalls: [],
});
