/** Assembles Import AI tasks behind the application's import capability contract. */

import OpenAI from 'openai';
import type { AiContext, AiTurnCompleted } from './types.js';
import type { TaskRuntime } from './tasks/task.js';
import type {
  ImportAi,
  Source,
  ReferenceDocument,
  EmptyResearchField,
  ResearchThing,
} from '../../application/import/types.js';
import { readResourcePage } from '../web/resources.js';
import { ResolveThingTask } from './tasks/resolve-thing.js';
import { PopulateFieldsTask } from './tasks/populate-fields.js';
import { AdditionalInformationTask } from './tasks/additional-information.js';
import { ResourceApplicabilityTask } from './tasks/resource-applicability.js';
import { SourceRecommendationsTask } from './tasks/source-recommendations.js';
import { SelectFieldSetsTask } from './tasks/select-field-sets.js';
import { TranscribeTask } from './tasks/transcribe.js';
import { ExtractSourceTask } from './tasks/extract-source.js';
import { ExtractDocumentTask } from './tasks/extract-document.js';
import { FindResourcesTask } from './tasks/find-resources.js';
import { SuggestTasksTask } from './tasks/suggest-tasks.js';
import { FindPurchasablesTask } from './tasks/find-purchasables.js';

export class OpenAiImports implements ImportAi {
  private runtime: TaskRuntime;
  constructor(
    key: string,
    model: string,
    maxOutputTokens = 12000,
    private searchCalls = 3,
    private documentModel = model,
    private readPage = readResourcePage,
    onTurnCompleted?: AiTurnCompleted,
    maxTextCharacters = 120000,
  ) {
    this.runtime = {
      client: new OpenAI({ apiKey: key, maxRetries: 0 }),
      model,
      maxOutputTokens,
      maxTextCharacters,
      onTurnCompleted,
    };
  }

  resolveThing: NonNullable<ImportAi['resolveThing']> = (input, tools, context) =>
    new ResolveThingTask(this.runtime, input, tools).run(context);

  populateFields: NonNullable<ImportAi['populateFields']> = (input, tools, context) =>
    new PopulateFieldsTask(this.runtime, input, tools).run(context);

  additionalInformation: NonNullable<ImportAi['additionalInformation']> = (input, tools, context) =>
    new AdditionalInformationTask({ ...this.runtime, model: this.documentModel }, input, tools).run(
      context,
    );

  assessResource: NonNullable<ImportAi['assessResource']> = (input, tools, context) =>
    new ResourceApplicabilityTask(this.runtime, input, tools).run(context);

  recommendFromSources: NonNullable<ImportAi['recommendFromSources']> = (input, tools, context) =>
    new SourceRecommendationsTask(this.runtime, input, tools).run(context);

  selectFieldSets: NonNullable<ImportAi['selectFieldSets']> = (input, tools, context) =>
    new SelectFieldSetsTask(this.runtime, input, tools).run(context);

  transcribe: ImportAi['transcribe'] = (source, context) =>
    new TranscribeTask(this.runtime, source).run(context);
  findResources: ImportAi['findResources'] = (input, context, searchCalls = this.searchCalls) =>
    new FindResourcesTask(this.runtime, input, searchCalls, this.readPage).run(context);
  suggestTasks: ImportAi['suggestTasks'] = (input, context, searchCalls = this.searchCalls) =>
    new SuggestTasksTask(this.runtime, input, searchCalls).run(context);
  findPurchasables: ImportAi['findPurchasables'] = (
    input,
    context,
    searchCalls = this.searchCalls,
  ) => new FindPurchasablesTask(this.runtime, input, searchCalls).run(context);

  // Exposes source extraction for the existing evaluation and provider checks.
  extract(source: Source, categories: string[], context: AiContext) {
    return new ExtractSourceTask(this.runtime, source, categories).run(context);
  }

  // Exposes document extraction for the existing evaluation and provider checks.
  extractDocument(
    document: ReferenceDocument,
    research: ResearchThing,
    targets: EmptyResearchField[],
    context: AiContext,
  ) {
    return new ExtractDocumentTask(
      { ...this.runtime, model: this.documentModel },
      document,
      research,
      targets,
    ).run(context);
  }
}
