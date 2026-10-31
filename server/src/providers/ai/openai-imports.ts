/** Assembles Import AI tasks behind the application's import capability contract. */

import type { EnvConfig } from '../../config.js';
import type { AiContext, AiTurnCompleted } from './types.js';
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
import { SummarizeAttachmentTask } from './tasks/summarize-attachment.js';
import { ExtractSourceTask } from './tasks/extract-source.js';
import { ExtractDocumentTask } from './tasks/extract-document.js';
import { FindResourcesTask } from './tasks/find-resources.js';
import { SuggestTasksTask } from './tasks/suggest-tasks.js';
import { FindPurchasablesTask } from './tasks/find-purchasables.js';

export class OpenAiImports implements ImportAi {
  constructor(
    private config: EnvConfig,
    private onTurnCompleted?: AiTurnCompleted,
    private readPage = readResourcePage,
  ) {}

  resolveThing: NonNullable<ImportAi['resolveThing']> = (input, tools, context) =>
    new ResolveThingTask(this.config, input, tools)
      .onTurnCompleted(this.onTurnCompleted)
      .run(context);

  populateFields: NonNullable<ImportAi['populateFields']> = (input, tools, context) =>
    new PopulateFieldsTask(this.config, input, tools)
      .onTurnCompleted(this.onTurnCompleted)
      .run(context);

  additionalInformation: NonNullable<ImportAi['additionalInformation']> = (input, tools, context) =>
    new AdditionalInformationTask(this.config, input, tools)
      .onTurnCompleted(this.onTurnCompleted)
      .run(context);

  assessResource: NonNullable<ImportAi['assessResource']> = (input, tools, context) =>
    new ResourceApplicabilityTask(this.config, input, tools)
      .onTurnCompleted(this.onTurnCompleted)
      .run(context);

  recommendFromSources: NonNullable<ImportAi['recommendFromSources']> = (input, tools, context) =>
    new SourceRecommendationsTask(this.config, input, tools)
      .onTurnCompleted(this.onTurnCompleted)
      .run(context);

  selectFieldSets: NonNullable<ImportAi['selectFieldSets']> = (input, tools, context) =>
    new SelectFieldSetsTask(this.config, input, tools)
      .onTurnCompleted(this.onTurnCompleted)
      .run(context);

  summarizeAttachment: ImportAi['summarizeAttachment'] = (text, context) =>
    new SummarizeAttachmentTask(this.config, text)
      .onTurnCompleted(this.onTurnCompleted)
      .run(context);
  findResources: ImportAi['findResources'] = (
    input,
    context,
    searchCalls = this.config.discoverySearchCalls,
  ) =>
    new FindResourcesTask(this.config, input, searchCalls, this.readPage)
      .onTurnCompleted(this.onTurnCompleted)
      .run(context);
  suggestTasks: ImportAi['suggestTasks'] = (
    input,
    context,
    searchCalls = this.config.discoverySearchCalls,
  ) =>
    new SuggestTasksTask(this.config, input, searchCalls)
      .onTurnCompleted(this.onTurnCompleted)
      .run(context);
  findPurchasables: ImportAi['findPurchasables'] = (
    input,
    context,
    searchCalls = this.config.discoverySearchCalls,
  ) =>
    new FindPurchasablesTask(this.config, input, searchCalls)
      .onTurnCompleted(this.onTurnCompleted)
      .run(context);

  // Exposes source extraction for the existing evaluation and provider checks.
  extract(source: Source, categories: string[], context: AiContext) {
    return new ExtractSourceTask(this.config, source, categories)
      .onTurnCompleted(this.onTurnCompleted)
      .run(context);
  }

  // Exposes document extraction for the existing evaluation and provider checks.
  extractDocument(
    document: ReferenceDocument,
    research: ResearchThing,
    targets: EmptyResearchField[],
    context: AiContext,
  ) {
    return new ExtractDocumentTask(this.config, document, research, targets)
      .onTurnCompleted(this.onTurnCompleted)
      .run(context);
  }
}
