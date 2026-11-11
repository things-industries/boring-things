/** Assembles Import AI tasks behind the application's import capability contract. */

import type { AiContext, AiTurnCompleted, RegistryResources } from './types.js';
import type { ImportAi, Source } from '../../application/import/types.js';
import { readResourcePage } from '../web/resources.js';
import { ResolveThingTask } from './tasks/resolve-thing.js';
import { PopulateFieldsTask } from './tasks/populate-fields.js';
import { AdditionalInformationTask } from './tasks/additional-information.js';
import { ResourceApplicabilityTask } from './tasks/resource-applicability.js';
import { SelectFieldSetsTask } from './tasks/select-field-sets.js';
import { SummarizeAttachmentTask } from './tasks/summarize-attachment.js';
import { ExtractSourceTask } from './tasks/extract-source.js';
import { FindResourcesTask } from './tasks/find-resources.js';
import { SuggestTasksTask } from './tasks/suggest-tasks.js';
import { FindPurchasablesTask } from './tasks/find-purchasables.js';

export class OpenAiImports implements ImportAi {
  constructor(
    private onTurnCompleted?: AiTurnCompleted,
    private readPage = readResourcePage,
    private registryResources?: RegistryResources,
  ) {}

  resolveThing: NonNullable<ImportAi['resolveThing']> = (input, context) =>
    new ResolveThingTask(input, context).onTurnCompleted(this.onTurnCompleted).run();

  populateFields: NonNullable<ImportAi['populateFields']> = (input, context) =>
    new PopulateFieldsTask(input, context).onTurnCompleted(this.onTurnCompleted).run();

  additionalInformation: NonNullable<ImportAi['additionalInformation']> = (input, context) =>
    new AdditionalInformationTask(input, context, this.registryResources)
      .onTurnCompleted(this.onTurnCompleted)
      .run();

  assessResource: NonNullable<ImportAi['assessResource']> = (input, context) =>
    new ResourceApplicabilityTask(input, context).onTurnCompleted(this.onTurnCompleted).run();

  selectFieldSets: NonNullable<ImportAi['selectFieldSets']> = (input, context) =>
    new SelectFieldSetsTask(input, context, this.registryResources)
      .onTurnCompleted(this.onTurnCompleted)
      .run();

  summarizeAttachment: ImportAi['summarizeAttachment'] = (input, context) =>
    new SummarizeAttachmentTask(input, context).onTurnCompleted(this.onTurnCompleted).run();
  findResources: ImportAi['findResources'] = (input, context) =>
    new FindResourcesTask(input, context, this.readPage)
      .onTurnCompleted(this.onTurnCompleted)
      .run();
  suggestTasks: ImportAi['suggestTasks'] = (input, context) =>
    new SuggestTasksTask(input, context).onTurnCompleted(this.onTurnCompleted).run();
  findPurchasables: ImportAi['findPurchasables'] = (input, context) =>
    new FindPurchasablesTask(input, context).onTurnCompleted(this.onTurnCompleted).run();

  // Exposes source extraction for the existing evaluation and provider checks.
  extract(source: Source, categories: string[], context: AiContext) {
    return new ExtractSourceTask(source, categories, context)
      .onTurnCompleted(this.onTurnCompleted)
      .run();
  }
}
