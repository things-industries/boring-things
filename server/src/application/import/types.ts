import type { PublicField } from '../public-fields.js';
import type { FieldSearchLabel } from '../registry/registry.js';
/**
 * Defines import extraction, mapping, discovery and provider interfaces, plus shared usage tracking
 * and active job states.
 */

import type { FieldDefinition, FieldSet, Schema, Value } from '../../../../shared/model.js';
import type { components } from '../../providers/ai/schema-types.js';

export interface Fact {
  id: string;
  label: string;
  value: Value;
  quote: string;
  page: number | null;
  sensitive: boolean;
  attachmentId?: string;
}

export interface ImportIdentifier {
  kind: string;
  value: string;
  attachmentId: string;
  page: number | null;
  quote: string;
}

export interface ImportSourceText {
  attachmentId: string;
  filename: string;
  text: string;
  summary: string | null;
  terms: string[];
}

export interface SourceTranscription {
  text: string;
  summary: string | null;
  terms: string[];
  status: 'COMPLETE' | 'EMPTY' | 'PARTIAL' | 'INSUFFICIENT_LANGUAGE';
  metadata: Schema['AttachmentPatch'] | null;
}

export interface ExtractedThing {
  id: string;
  name: string;
  categoryId: string;
  terms: string[];
  identifiers?: ImportIdentifier[];
  sourceRefs?: { attachmentId: string; page: number | null; quote: string }[];
  reviewRequired?: boolean;
  possibleMatches?: string[];
  targeted?: boolean;
  relevantAttachmentIds?: string[];
  linksCommitted?: boolean;
  assessments?: {
    attachmentId: string;
    relevant: boolean;
    summary: string | null;
    terms: string[];
  }[];
  facts: Fact[];
  mapping?: { setIds: string[]; batches: FactMapping[] };
}

export interface Extraction {
  text: string;
  extractedThings: ExtractedThing[];
  metadata?: Schema['AttachmentPatch'] | null;
  summary?: string | null;
  terms?: string[];
  transcriptionStatus?: 'COMPLETE' | 'EMPTY' | 'PARTIAL' | 'INSUFFICIENT_LANGUAGE';
}

export interface Source {
  filename: string;
  mediaType: string;
  content: Buffer;
  pageCount?: number | null;
  text?: string;
}

export type FactMapping = components['schemas']['Mapping'];

export interface DiscoveryItem {
  kind: 'reference' | 'image';
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
  documentBatches?: {
    attachmentId: string;
    targetKeys: string[];
  }[];
  warnings?: DiscoveryWarning[];
  rejectedDocumentUrls?: string[];
}

export interface TaskResearch extends Pick<ResearchThing, 'categoryId' | 'knownFields'> {
  referenceUrls: string[];
  existingTasks: Pick<Schema['Event'], 'title' | 'status'>[];
}

export interface PurchasableResearch extends Pick<ResearchThing, 'categoryId' | 'knownFields'> {
  referenceUrls: string[];
  existingPurchasables: Pick<Schema['Purchasable'], 'name' | 'kind'>[];
}

export interface TaskSuggestions {
  items: Pick<Schema['Event'], 'title' | 'description' | 'sourceRefs'>[];
}

export interface PurchasableSuggestions {
  items: Pick<
    Schema['Purchasable'],
    'kind' | 'name' | 'description' | 'merchantUrl' | 'sourceRefs'
  >[];
}

export interface ImportResearchCheckpoint {
  complete: boolean;
  warnings: DiscoveryWarning[];
}

export type Usage = Schema['ImportUsage'];

export type DiscoveryWarning = Omit<Schema['ImportWarning'], 'thingId'>;

export interface AiContext {
  signal: AbortSignal;
  record: (usage: Partial<Usage>) => Promise<void>;
}

export interface RegistryTools {
  searchFieldSets(categoryId: string, terms: string[]): Promise<unknown>;
  searchFields(labels: FieldSearchLabel[]): Promise<unknown>;
}

export interface ResearchThing {
  id: string;
  categoryId: string;
  knownFields: KnownResearchField[];
  emptyFields: EmptyResearchField[];
  documentLimits?: { maxBytes: number; maxTextCharacters: number };
  rejectedDocumentUrls?: string[];
  rejectedDocuments?: Pick<DiscoveryWarning, 'sourceUrl' | 'code' | 'actual' | 'limit'>[];
}

export interface EmptyResearchField {
  fieldSetId: string | null;
  fieldId: string;
  label: string;
  description: string;
  schema: FieldDefinition['schema'];
}

export type KnownResearchField = PublicField;

export interface ReferenceDocument extends Source {
  sourceContext?: { url: string; description: string };
  attachmentId: string;
  url: string;
  pageCount: number;
}

export interface DocumentExtraction {
  metadata: Schema['AttachmentPatch'] | null;
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

export interface ImportAi {
  transcribe?(source: Source, context: AiContext): Promise<SourceTranscription>;
  identifyCandidates?(
    sources: ImportSourceText[],
    categories: string[],
    context: AiContext,
  ): Promise<Omit<ExtractedThing, 'id' | 'facts'>[]>;
  extractTargetFacts?(
    sources: ImportSourceText[],
    thing: Pick<ExtractedThing, 'name' | 'categoryId' | 'terms' | 'identifiers'>,
    context: AiContext,
  ): Promise<
    {
      attachmentId: string;
      relevant: boolean;
      summary: string | null;
      terms: string[];
      facts: Fact[];
    }[]
  >;
  extract(source: Source, categories: string[], context: AiContext): Promise<Extraction>;
  selectFieldSets(
    extractedThing: ExtractedThing,
    tools: RegistryTools,
    context: AiContext,
  ): Promise<{ setIds: string[] }>;
  mapFacts(
    thing: ExtractedThing,
    facts: Fact[],
    selectedSets: FieldSet[],
    tools: RegistryTools,
    context: AiContext,
  ): Promise<FactMapping>;
  findResources(
    research: ResearchThing,
    context: AiContext,
    searchCalls?: number,
  ): Promise<Discovery>;
  extractDocument(
    document: ReferenceDocument,
    research: ResearchThing,
    targets: EmptyResearchField[],
    context: AiContext,
  ): Promise<DocumentExtraction>;
  suggestTasks(
    research: TaskResearch,
    context: AiContext,
    searchCalls?: number,
  ): Promise<TaskSuggestions>;
  findPurchasables(
    research: PurchasableResearch,
    context: AiContext,
    searchCalls?: number,
  ): Promise<PurchasableSuggestions>;
}

export const activeStatuses = [
  'QUEUED',
  'WAITING_FOR_TRANSCRIPTION',
  'EXTRACTING',
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
