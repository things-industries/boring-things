import type { Schema, Value } from '../../../shared/model.js';
export interface Fact {
  id: string;
  label: string;
  value: Value;
  quote: string;
  page: number | null;
  sensitive: boolean;
}
export interface Candidate {
  id: string;
  name: string;
  categoryId: string;
  terms: string[];
  facts: Fact[];
}
export interface Extraction {
  text: string;
  candidates: Candidate[];
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
}
export interface Discovery {
  items: DiscoveryItem[];
  sources: string[];
}
export type Usage = Schema['ImportUsage'];
export interface AiContext {
  signal: AbortSignal;
  record: (usage: Partial<Usage>) => Promise<void>;
}
export interface RegistryTools {
  searchFieldSets(categoryId: string, terms: string[]): Promise<unknown>;
  searchFields(labels: { label: string; context: string }[]): Promise<unknown>;
}
export interface ImportAi {
  extract(source: Source, categories: string[], context: AiContext): Promise<Extraction>;
  map(candidate: Candidate, tools: RegistryTools, context: AiContext): AsyncIterable<MappingStage>;
  discover(candidate: Candidate, context: AiContext): Promise<Discovery>;
}
export const activeStatuses = [
  'queued',
  'extracting',
  'awaiting_selection',
  'mapping',
  'discovering',
];
export const blankUsage = (model = ''): Usage => ({
  model,
  inputTokens: 0,
  outputTokens: 0,
  cachedTokens: 0,
  elapsedMs: 0,
  toolCalls: [],
});
