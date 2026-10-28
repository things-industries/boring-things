/** Defines application Import inputs, results, usage and workflow capability contracts. */

import type { PublicField } from '../public-fields.js';
import type { FieldSearchLabel } from '../registry/registry.js';
import type { FieldDefinition, Schema, Value } from '../../../../shared/model.js';
import type { AiContext } from '../../providers/ai/types.js';
import type { FieldProposal } from '../thing-fields.js';

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
  identifiers?: IdentifierObservation[];
  metadata: Schema['AttachmentPatch'] | null;
}

export interface ExtractedThing {
  id: string;
  name: string;
  categoryId: string;
  terms: string[];
  identifiers?: ImportIdentifier[];
  sourceRefs?: { attachmentId: string; page: number | null; quote: string }[];
  facts: Fact[];
  knownFields?: KnownResearchField[];
  sources?: Pick<ImportSourceText, 'attachmentId' | 'summary' | 'terms'>[];
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

export interface TaskResearch extends Pick<ResearchThing, 'name' | 'categoryId' | 'knownFields'> {
  referenceUrls: string[];
  existingTasks: Pick<Schema['Event'], 'title' | 'status'>[];
}

export interface PurchasableResearch extends Pick<
  ResearchThing,
  'name' | 'categoryId' | 'knownFields'
> {
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

export type Usage = Schema['ImportUsage'];

export type DiscoveryWarning = Omit<Schema['ImportWarning'], 'thingId'>;

export class UsagePersistenceError extends Error {
  constructor(cause: unknown) {
    super('Usage persistence failed', { cause });
  }
}

export interface RegistryTools {
  searchFieldSets(categoryId: string, terms: string[]): Promise<unknown>;
  searchFields(labels: FieldSearchLabel[]): Promise<unknown>;
}

export interface ResearchThing {
  id: string;
  name?: string;
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

export interface AdditionalInformationInput {
  thing: { name: string; categoryId: string; identifiers?: { fieldId: string; value: Value }[] };
  knownFields: string[];
  attachmentId: string;
  text: string;
}

export interface ImportAi {
  assessResource?(
    input: ResourceApplicabilityInput,
    tools: WorkflowTools,
    context: AiContext,
  ): Promise<ResourceApplicability>;
  recommendFromSources?(
    input: SourceRecommendationsInput,
    tools: WorkflowTools,
    context: AiContext,
  ): Promise<SourceRecommendations>;
  resolveThing?(
    input: ResolutionInput,
    tools: WorkflowTools,
    context: AiContext,
  ): Promise<ResolutionResult>;
  populateFields?(
    input: PopulationInput,
    tools: WorkflowTools,
    context: AiContext,
  ): Promise<PopulationResult>;
  additionalInformation?(
    input: AdditionalInformationInput,
    tools: WorkflowTools,
    context: AiContext,
  ): Promise<AdditionalInformationResult>;
  transcribe(source: Source, context: AiContext): Promise<SourceTranscription>;
  selectFieldSets(
    extractedThing: ExtractedThing,
    tools: RegistryTools,
    context: AiContext,
  ): Promise<{ setIds: string[] }>;
  findResources(
    research: ResearchThing,
    context: AiContext,
    searchCalls?: number,
  ): Promise<Discovery>;
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
  'RECOMMENDING',
];

export const blankUsage = (model = ''): Usage => ({
  model,
  inputTokens: 0,
  outputTokens: 0,
  cachedTokens: 0,
  elapsedMs: 0,
  toolCalls: [],
});

export interface IdentifierObservation {
  label: string;
  value: string;
  page: number | null;
  quote: string;
}
export interface ThingCandidate {
  id: string;
  name: string;
  categoryId: string;
  terms: string[];
  identifiers: (SourceEvidence & { fieldId: string; value: string })[];
  attachmentIds: string[];
  strength: number;
  matchedThingId: string | null;
}

export interface SourceEvidence {
  attachmentId: string;
  page: number | null;
  quote: string;
}

export interface ResolutionResult {
  candidates: Omit<ThingCandidate, 'id'>[];
  contradiction: boolean;
}

export interface PopulationResult {
  values: FieldProposal[];
  pinnedFields: Pick<FieldProposal, 'fieldSetId' | 'fieldId'>[];
}

export interface ResourceApplicability {
  applicable: boolean;
  identifiers: (SourceEvidence & { fieldId: string; value: string })[];
}

export interface AdditionalInformationResult {
  findings: (SourceEvidence & {
    label: string;
    fieldId: string | null;
    value: Value;
    sensitive: boolean;
    reason: string;
  })[];
}

export interface SourceRecommendations {
  tasks: TaskSuggestions['items'];
  purchasables: (Omit<PurchasableSuggestions['items'][number], 'merchantUrl'> & {
    merchantUrl: string | null;
  })[];
}

export interface ResourceApplicabilityInput {
  categoryId: string;
  knownFields: KnownResearchField[];
  identifierFields: FieldDefinition[];
  source: Pick<ImportSourceText, 'attachmentId' | 'summary' | 'terms'> & {
    identifiers: IdentifierObservation[] | null;
  };
}

export interface SourceRecommendationsInput {
  thing: AdditionalInformationInput['thing'];
  fields: { id: string; value: Value | null }[];
  sources: Pick<ImportSourceText, 'attachmentId' | 'summary' | 'terms'>[];
  existingTasks: TaskResearch['existingTasks'];
  existingPurchasables: PurchasableResearch['existingPurchasables'];
}
export interface WorkflowTools {
  searchTranscription(
    attachmentId: string,
    query: string,
    offset: number,
  ): Promise<{ attachmentId: string; text: string; offset: number; nextOffset: number | null }>;
  searchFields(labels: FieldSearchLabel[]): Promise<unknown>;
  searchFieldSets(categoryId: string, terms: string[]): Promise<unknown>;
}
export interface ResolutionInput {
  sources: (Pick<ImportSourceText, 'attachmentId' | 'summary' | 'terms'> & {
    identifiers: IdentifierObservation[];
  })[];
  categories: { id: string; name: string; description: string; identifiers: FieldDefinition[] }[];
  existingThings: {
    id: string;
    name: string;
    categoryId: string;
    identifiers: { fieldId: string; value: Value }[];
  }[];
  thingContextId: string | null;
}
export interface PopulationInput {
  thing: {
    id: string;
    name: string;
    categoryId: string;
    identifiers?: { fieldId: string; value: Value }[];
  };
  sources: Pick<ImportSourceText, 'attachmentId' | 'summary' | 'terms'>[];
  fields: { fieldSetId: string | null; field: FieldDefinition; value: Value | null }[];
}
