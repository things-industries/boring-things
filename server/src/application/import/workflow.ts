/** Coordinates one Thing's identity, public research, shared field population and cited recommendations. */

import { getEnv } from '../../config.js';
import { randomUUID, createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import type pg from 'pg';
import type { Registry } from '../registry/registry.js';
import type { BlobStorage } from '../../providers/blobs/index.js';
import type { ApplicationEvents } from '../events.js';
import { getImportFailureReason, UsagePersistenceError } from './types.js';
import type { ImportAi, ImportTaskContext, ThingCandidate } from './types.js';
import type { ResolutionInput } from '../../providers/ai/tasks/resolve-thing.js';
import type { RecommendationInput } from '../../providers/ai/tasks/recommendation.js';
import type { AiContext } from '../../providers/ai/types.js';
import type { ImportRow, WorkflowCheckpoint } from '../../db/entities/imports.js';
import type { Database } from '../../db/connection.js';
import type { FieldProposal } from '../thing-fields.js';
import type { Schema, SourceRef } from '../../../../shared/model.js';
import * as database from '../../db/connection.js';
import * as importsDb from '../../db/entities/imports.js';
import * as thingsDb from '../../db/entities/things.js';
import * as attachmentsDb from '../../db/entities/attachments.js';
import * as thingFieldsDb from '../../db/entities/thing-fields.js';
import * as registryDb from '../../db/entities/registry.js';
import * as tasksDb from '../../db/entities/tasks.js';
import * as purchasablesDb from '../../db/entities/purchasables.js';
import { addFieldSets, fieldTargets, populateFields, identifierValues } from '../thing-fields.js';
import { inferCustomValueType, isCustomValue } from '../custom-fields.js';
import { publicFields } from '../public-fields.js';
import { ensure } from '../errors.js';
import { mapValidResults, normalizeWhitespace } from './evidence.js';
import { publicUrl } from '../../providers/web/resources.js';
import { downloadPdf } from '../../providers/web/pdf.js';
import { downloadImage } from '../../providers/web/image.js';
import { validateResource, saveResourceAttachment, resourceKey } from './resources.js';
import type { SpecialistProvider } from '../../providers/specialist-data.js';
import { IcecatProvider } from '../../providers/icecat/index.js';
import { ZyfyProvider } from '../../providers/zyfy/index.js';
import { getAdditionalInformationBatch } from '../../providers/ai/tasks/additional-information.js';
import * as metrics from '../../metrics.js';

export interface WorkflowOptions {
  download?: typeof downloadPdf;
  downloadImage?: typeof downloadImage;
  specialists?: SpecialistProvider[];
}

export class ImportWorkflow {
  private sources: attachmentsDb.AttachmentRow[] = [];
  constructor(
    private pool: pg.Pool,
    private registry: Registry,
    private blobs: BlobStorage,
    private ai: ImportAi,
    private events: ApplicationEvents,
    private job: ImportRow,
    private context: AiContext,
    private options: WorkflowOptions,
  ) {}

  // Executes unfinished stages while preserving the selected Thing and completed batches.
  async run() {
    metrics.setJobStage('read_sources');
    this.sources = await importsDb.listImportSources(this.pool, this.job);
    await metrics.withStage('resolve_import_identity', () => this.identity());
    for (const source of this.job.sources) {
      if (source.status === 'FAILED')
        await this.warning('source:' + source.attachmentId, null, 'EXTRACTION_FAILED');
      else await this.commit('source:' + source.attachmentId);
    }
    if (this.job.operation === 'IMPORT') {
      await metrics.withStage('look_up_specialist_data', () => this.specialists());
      await metrics.withStage('research_import', () => this.research());
      await this.applyResearchIdentity();
      await this.readLinkedSources();
      await this.assessSources();
      await this.selectFields();
      await metrics.withStage('populate_import_fields', () => this.populate());
      await this.additional();
    }
    await this.readLinkedSources();
    await this.assessSources();
    await metrics.withStage('recommend_for_thing', () => this.recommend());
    return this.job.workflow.warnings.length;
  }

  // Applies a cited everyday name to an imported Thing until the owner edits its name.
  private async applyResearchIdentity() {
    const discovery = this.job.workflow.discovery,
      identity = discovery?.identity;
    if (
      !this.job.workflow.isNew ||
      this.job.workflow.done.includes('researchIdentity') ||
      !identity ||
      !identity.name.trim() ||
      identity.name.length > 200 ||
      !publicUrl(identity.sourceUrl)
    )
      return;
    await this.commit('researchIdentity', async (db, current) => {
      if (current.data.userEdited?.includes('name')) return;
      const model = identifierValues(current.data, this.registry).find(({ fieldId }) =>
        ['common.model', 'appliances.eNumber'].includes(fieldId),
      )?.value;
      const name = await importsDb.findAvailableImportName(
        db,
        current.ownerId,
        current.id,
        identity.name,
        typeof model === 'string' ? model : undefined,
      );
      await thingsDb.renameThing(db, current.ownerId, current.id, name);
    });
  }

  // Publishes progress after persisted changes are visible.
  private publish() {
    this.events.publish({ type: 'data.changed', ownerId: this.job.ownerId });
  }

  // Reads the selected Thing using the request's ownership boundary.
  private async thing() {
    ensure(this.job.targetThingId, 'no_thing_identified');
    const thing = await thingsDb.getOwnedThingOrThrow(
      this.pool,
      this.job.ownerId,
      this.job.targetThingId,
    );
    metrics.setJobEntity({ type: 'thing', id: thing.id, name: thing.name });
    return thing;
  }

  // Saves application changes and their completion record under the same transaction.
  private async commit(
    key: string,
    work?: (db: Database, current: thingsDb.ThingRow) => Promise<void>,
  ) {
    this.context.signal.throwIfAborted();
    await metrics.withStage('save_import_checkpoint', () =>
      database.transaction(this.pool, async (db) => {
        const job = await importsDb.getOwnedImportOrThrow(db, this.job.ownerId, this.job.id, {
          lock: true,
        });
        ensure(job.targetThingId, 'no_thing_identified');
        const current = await thingsDb.getOwnedThingOrThrow(db, job.ownerId, job.targetThingId, {
          lock: true,
        });
        if (work) await work(db, current);
        this.context.signal.throwIfAborted();
        const saved = await importsDb.getOwnedImportOrThrow(db, job.ownerId, job.id);
        const workflow = {
          ...saved.workflow,
          done: [...new Set([...saved.workflow.done, key])],
          warnings: saved.workflow.warnings.filter((entry) => entry.stage !== key),
        };
        await importsDb.saveWorkflow(db, job, workflow);
        this.job = { ...saved, workflow };
      }),
    );
    this.publish();
  }

  // Records a visible stage before issuing external work.
  private async stage(stage: string, status: ImportRow['status']) {
    metrics.setJobStage(stage.toLowerCase());
    this.job.workflow.stage = stage;
    await importsDb.saveWorkflow(this.pool, this.job, this.job.workflow);
    await importsDb.setImportStatus(this.pool, this.job.ownerId, this.job.id, status);
    this.publish();
  }

  // Retains an optional failure while leaving its operation retryable.
  private async warning(
    stage: string,
    url: string | null = null,
    code: Schema['ImportWarning']['code'] = 'RESEARCH_FAILED',
    reason?: string,
  ) {
    ensure(this.job.targetThingId, 'no_thing_identified');
    const warning: Schema['ImportWarning'] = {
      thingId: this.job.targetThingId,
      code,
      sourceUrl: url,
      retryable: true,
      actual: null,
      limit: null,
    };
    this.job.workflow.warnings = this.job.workflow.warnings.filter(
      (entry) => entry.stage !== stage,
    );
    this.job.workflow.warnings.push({ stage, warning, reason });
    await importsDb.saveWorkflow(this.pool, this.job, this.job.workflow);
    const [operation, item] = stage.split(':');
    metrics.recordImportWarning({
      stage: operation,
      reason: reason ?? code,
      ...(['source', 'applicability', 'additional'].includes(operation) && { attachmentId: item }),
      ...(operation === 'specialist' && { provider: item }),
      ...(operation === 'resource' && { provider: 'web' }),
    });
    this.publish();
  }

  // Supplies authorised data and retrieval records for one task execution.
  private createTaskContext(categoryId: string): ImportTaskContext {
    return {
      ...this.context,
      categoryId,
      sources: this.sources.map((source) => ({
        attachmentId: source.id,
        text: source.transcription ?? '',
      })),
      retrievedSetIds: new Set(),
      retrievedFieldIds: new Set(),
      toolCalls: 0,
      toolCallLimit: getEnv('IMPORT_TOOL_ROUNDS'),
    };
  }

  // Keeps authorised source links and includes only matching quotations and page references.
  private evidence(value: {
    attachmentId?: string;
    page?: number | null;
    quote?: string;
  }): SourceRef {
    const source = this.sources.find((source) => source.id === value.attachmentId);
    ensure(source, 'Invalid source evidence');
    const quote = normalizeWhitespace(value.quote ?? '');
    const matched =
      quote.length > 0 &&
      quote.length <= 2000 &&
      normalizeWhitespace(source.transcription ?? '').includes(quote);
    let page = value.page ?? null;
    if (
      page !== null &&
      (source.mediaType !== 'application/pdf' ||
        !Number.isInteger(page) ||
        page < 1 ||
        (source.pageCount !== null && page > source.pageCount))
    )
      page = null;
    if (
      page !== null &&
      source.mediaType === 'application/pdf' &&
      /\[PDF page \d+\]/.test(source.transcription ?? '')
    ) {
      const text = source.transcription ?? '',
        marker = `[PDF page ${page}]`,
        start = text.indexOf(marker);
      const end = text.indexOf('[PDF page ', start + marker.length);
      if (
        !matched ||
        start < 0 ||
        !normalizeWhitespace(text.slice(start, end < 0 ? undefined : end)).includes(quote)
      )
        page = null;
    }
    return {
      attachmentId: source.id,
      ...(page !== null ? { page } : {}),
      ...(matched ? { quote } : {}),
      ...(source.sourceUrl ? { url: source.sourceUrl } : {}),
    };
  }

  // Resolves a single candidate and saves its identity before any public research.
  private async identity() {
    if (this.job.workflow.done.includes('identity')) return;
    await this.stage('IDENTIFYING', 'EXTRACTING');
    let candidate: ThingCandidate;
    const usable = this.sources.filter(
      (source) =>
        (source.transcription || source.transcriptionSummary) &&
        ['COMPLETE', 'PARTIAL'].includes(source.transcriptionStatus),
    );
    if (!usable.length && this.job.targetThingId) {
      const thing = await this.thing();
      candidate = {
        id: this.job.workflow.selected?.id ?? randomUUID(),
        name: thing.name,
        categoryId: thing.categoryId,
        terms: [thing.name],
        identifiers: [],
        attachmentIds: [],
        strength: 1,
        matchedThingId: thing.id,
      };
    } else {
      ensure(usable.length && this.ai.resolveThing, 'no_thing_identified');
      this.sources = usable;
      const categories = (await registryDb.listCategoryDefinitions(this.pool)).map(
        ({ id, name, description }) => ({
          id,
          name,
          description,
          identifiers: [
            ...new Map(
              [...this.registry.sets.values()]
                .filter((set) => set.categoryId === id)
                .flatMap((set) => set.fields)
                .filter((field) => field.isIdentifier)
                .map((field) => [field.id, field]),
            ).values(),
          ],
        }),
      );
      const owned = await database.rows<{ id: string; name: string; categoryId: string }>(
        this.pool,
        'select id,name,category_id from bt.things where owner_id=$1 order by id limit 100',
        [this.job.ownerId],
      );
      if (this.job.targetThingId && !owned.some((thing) => thing.id === this.job.targetThingId)) {
        const context = await this.thing();
        owned.push({ id: context.id, name: context.name, categoryId: context.categoryId });
      }
      const existing: ResolutionInput['existingThings'] = [];
      const cached = new Map<string, Awaited<ReturnType<typeof thingFieldsDb.identifiers>>>();
      for (const thing of owned) {
        let identifiers = cached.get(thing.categoryId);
        if (!identifiers) {
          identifiers = await thingFieldsDb.identifiers(
            this.pool,
            this.job.ownerId,
            thing.categoryId,
          );
          cached.set(thing.categoryId, identifiers);
        }
        existing.push({
          ...thing,
          identifiers: identifiers
            .filter((entry) => entry.thingId === thing.id)
            .map(({ fieldId, value }) => ({ fieldId, value })),
        });
      }
      const result = await this.ai.resolveThing(
        {
          sources: usable.map((source) => ({
            attachmentId: source.id,
            summary: source.transcriptionSummary,
            terms: source.transcriptionTerms,
            identifiers: source.identifierObservations ?? [],
          })),
          categories,
          existingThings: existing,
          thingContextId: this.job.targetThingId,
        },
        this.createTaskContext(this.job.targetThingId ? (await this.thing()).categoryId : ''),
      );
      ensure(!this.job.targetThingId || !result.contradiction, 'wrong_thing');
      const selected = [...result.candidates].sort((a, b) => b.strength - a.strength)[0];
      ensure(selected, 'no_thing_identified');
      candidate = { ...selected, id: this.job.workflow.selected?.id ?? randomUUID() };
      ensure(
        categories.some((category) => category.id === candidate.categoryId),
        'Invalid category',
      );
      ensure(
        !candidate.matchedThingId ||
          owned.some(
            (thing) =>
              thing.id === candidate.matchedThingId && thing.categoryId === candidate.categoryId,
          ),
        'Invalid Thing match',
      );
      if (this.job.targetThingId) {
        const context = await this.thing();
        ensure(candidate.categoryId === context.categoryId, 'wrong_thing');
        candidate.matchedThingId = context.id;
      }
      candidate.identifiers = mapValidResults(candidate.identifiers, (identifier) => {
        ensure(
          categories
            .find((category) => category.id === candidate.categoryId)
            ?.identifiers.some((field) => field.id === identifier.fieldId),
          'Invalid identifier',
        );
        const source = this.sources.find((file) => file.id === identifier.attachmentId);
        ensure(
          source?.ownerId !== null ||
            ['GROUP', 'CLASS'].includes(this.registry.fields.get(identifier.fieldId)?.scope ?? ''),
          'Public source supplied instance data',
        );
        this.evidence(identifier);
        return identifier;
      });
      ensure(
        candidate.attachmentIds.every((id) => usable.some((source) => source.id === id)),
        'Invalid source association',
      );
    }
    await database.transaction(this.pool, async (db) => {
      const current = await importsDb.getOwnedImportOrThrow(db, this.job.ownerId, this.job.id, {
        lock: true,
      });
      let thing: thingsDb.ThingRow;
      const isNew = !candidate.matchedThingId;
      if (candidate.matchedThingId)
        thing = await thingsDb.getOwnedThingOrThrow(db, current.ownerId, candidate.matchedThingId, {
          lock: true,
        });
      else {
        const model = candidate.identifiers.find(
          (entry) =>
            this.registry.fields.get(entry.fieldId)?.isIdentifier &&
            this.registry.fields.get(entry.fieldId)?.scope === 'CLASS',
        )?.value;
        const name = await importsDb.findAvailableImportName(
          db,
          current.ownerId,
          null,
          candidate.name,
          model,
        );
        const data = addFieldSets(
          { setIds: [], values: {}, standalone: {}, customFields: [], pins: [] },
          candidate.categoryId,
          this.registry,
        );
        thing = await thingsDb.insertThing(db, current.ownerId, {
          name,
          description: '',
          categoryId: candidate.categoryId,
          data,
        });
      }
      let data = addFieldSets(thing.data, thing.categoryId, this.registry);
      const proposals: FieldProposal[] = candidate.identifiers.map((entry) => {
        const fieldset = [...this.registry.sets.values()].find(
          (set) =>
            set.categoryId === thing.categoryId &&
            set.eligibility === null &&
            set.fields.some((field) => field.id === entry.fieldId),
        );
        ensure(fieldset, 'Identifier requires a mandatory fieldset');
        return {
          fieldSetId: fieldset.id,
          fieldId: entry.fieldId,
          value: entry.value,
          sourceRefs: [this.evidence(entry)],
        };
      });
      data = populateFields(data, proposals, this.registry);
      await thingsDb.saveThingData(db, current.ownerId, thing.id, data);
      for (const id of candidate.attachmentIds)
        await attachmentsDb.linkAttachment(db, current.ownerId, id, thing.id, true);
      const workflow: WorkflowCheckpoint = {
        ...current.workflow,
        selected: candidate,
        isNew,
        done: [...current.workflow.done, 'identity'],
      };
      await importsDb.saveWorkflow(db, current, workflow, thing.id);
      this.job = { ...current, targetThingId: thing.id, resultThingIds: [thing.id], workflow };
    });
    this.publish();
  }

  // Saves mapped specialist results before document research reads the Thing.
  private async specialists() {
    if (this.job.workflow.done.includes('specialists')) return;
    await this.stage('RESEARCH', 'DISCOVERING');
    metrics.setJobStage('specialist');
    const providers = this.options.specialists ?? [
      ...(getEnv('ICECAT_ACCESS_TOKEN', { optional: true }) ? [new IcecatProvider()] : []),
      ...(getEnv('ZYFY_API_KEY', { optional: true }) ? [new ZyfyProvider()] : []),
    ];
    for (const provider of providers) {
      const key = 'specialist:' + provider.id;
      const thing = await this.thing();
      if (this.job.workflow.done.includes(key) || !provider.applicable(thing)) continue;
      let result;
      await this.context.record({
        toolCalls: [{ name: provider.id, resultCount: 0, truncated: false }],
      });
      try {
        result = await provider.lookup(thing, this.registry, this.context.signal);
      } catch (error) {
        if (error instanceof UsagePersistenceError) throw error;
        this.context.signal.throwIfAborted();
        await this.warning(key, null, 'RESEARCH_FAILED', getImportFailureReason(error));
        continue;
      }
      await this.commit(key, async (db, current) => {
        let data = addFieldSets(current.data, current.categoryId, this.registry, result.setIds);
        data = populateFields(data, result.values, this.registry, 'DISCOVERY');
        await thingsDb.saveThingData(db, current.ownerId, current.id, data);
      });
    }
    if (!this.job.workflow.warnings.some((entry) => entry.stage.startsWith('specialist:')))
      await this.commit('specialists');
  }

  // Reuses or retrieves bounded public resources and waits while transcription continues independently.
  private async research() {
    if (this.job.workflow.done.includes('research')) return;
    await this.stage('RESEARCH', 'DISCOVERING');
    const thing = await this.thing();
    const known = publicFields(thing.data, this.registry);
    const identifiers = known
      .filter(
        (field) =>
          this.registry.fields.get(field.fieldId)?.isIdentifier &&
          this.registry.fields.get(field.fieldId)?.scope === 'CLASS' &&
          typeof field.value === 'string',
      )
      .map((field) => ({ fieldId: field.fieldId, value: String(field.value) }));
    for (const file of await attachmentsDb.findShared(this.pool, identifiers))
      await this.attachResource(file.id);
    if (!this.job.workflow.discovery && known.length) {
      let discovery;
      try {
        discovery = await this.ai.findResources(
          {
            id: thing.id,
            name: this.job.workflow.selected?.attachmentIds.length
              ? this.job.workflow.selected.name
              : undefined,
            categoryId: thing.categoryId,
            knownFields: known,
            emptyFields: [],
          },
          this.context,
        );
      } catch (error) {
        if (error instanceof UsagePersistenceError) throw error;
        this.context.signal.throwIfAborted();
        await this.warning('research', null, 'RESEARCH_FAILED', getImportFailureReason(error));
        return;
      }
      this.job.workflow.discovery = discovery;
      await importsDb.saveWorkflow(this.pool, this.job, this.job.workflow);
    }
    for (const item of this.job.workflow.discovery?.items.slice(
      0,
      getEnv('IMPORT_MAX_RESOURCES'),
    ) ?? []) {
      metrics.setJobStage('download_resource');
      const key = 'resource:' + resourceKey(item);
      if (this.job.workflow.done.includes(key)) continue;
      let id = (
        await attachmentsDb.findDiscoveryAttachment(this.pool, this.job.ownerId, resourceKey(item))
      )?.id;
      const reused = id !== undefined;
      if (!id) {
        let content: { content: Buffer; mediaType: string } | null | undefined;
        try {
          validateResource(item);
          if (item.kind === 'reference') {
            const bytes = await (this.options.download ?? downloadPdf)(item.url, {
              maxBytes: getEnv('MAX_UPLOAD_BYTES'),
              signal: this.context.signal,
            });
            ensure(bytes, 'Document unavailable');
            content = { content: bytes, mediaType: 'application/pdf' };
          } else
            content = await (this.options.downloadImage ?? downloadImage)(item.url, {
              maxBytes: getEnv('MAX_UPLOAD_BYTES'),
              signal: this.context.signal,
            });
          ensure(content, 'Resource unavailable');
        } catch (error) {
          if (error instanceof UsagePersistenceError) throw error;
          this.context.signal.throwIfAborted();
          await this.warning(key, item.url, 'UNAVAILABLE', getImportFailureReason(error));
          continue;
        }
        metrics.setJobStage('save_resource');
        id = (
          await saveResourceAttachment(
            this.pool,
            this.blobs,
            this.job.ownerId,
            thing.id,
            resourceKey(item),
            item,
            content,
            this.context.signal,
          )
        )?.id;
        ensure(id, 'Resource persistence failed');
      }
      await this.attachResource(id);
      await this.commit(key);
      metrics.recordImportDiagnostic('import_resource_linked', { attachmentId: id, reused });
    }
    const waiting = AbortSignal.any([
      this.context.signal,
      AbortSignal.timeout(getEnv('DISCOVERY_TIMEOUT_MS')),
    ]);
    metrics.setJobStage('wait_for_transcription');
    try {
      await metrics.withStage('wait_for_discovered_transcriptions', async () => {
        for (;;) {
          const files = await importsDb.listImportSources(this.pool, this.job);
          if (
            !files.some(
              (file) =>
                this.job.workflow.resourceIds.includes(file.id) &&
                ['PENDING', 'PROCESSING'].includes(file.transcriptionStatus),
            )
          )
            return;
          await setTimeout(100, undefined, { signal: waiting });
        }
      });
    } catch (error) {
      this.context.signal.throwIfAborted();
      if (!(error instanceof Error && error.name === 'AbortError' && waiting.aborted)) throw error;
      await this.warning('research', null, 'TIMEOUT', 'transcription_wait_timeout');
      return;
    }
    for (const id of this.job.workflow.resourceIds) {
      const file = await attachmentsDb.getOwnedAttachmentOrThrow(this.pool, this.job.ownerId, id);
      if (file.transcriptionStatus !== 'FAILED') await this.commit('source:' + id);
      if (file.transcriptionStatus === 'FAILED')
        await this.warning('source:' + id, file.sourceUrl, 'EXTRACTION_FAILED');
    }
    if (!this.job.workflow.warnings.some((entry) => entry.stage.startsWith('resource:')))
      await this.commit('research');
  }

  // Registers a resource link and its Import reference atomically.
  private async attachResource(id: string) {
    await database.transaction(this.pool, async (db) => {
      const job = await importsDb.getOwnedImportOrThrow(db, this.job.ownerId, this.job.id, {
        lock: true,
      });
      ensure(job.targetThingId, 'no_thing_identified');
      const thing = await thingsDb.getOwnedThingOrThrow(db, job.ownerId, job.targetThingId, {
        lock: true,
      });
      if (thing.data.userEdited?.includes('attachment:' + id)) return;
      await attachmentsDb.linkAttachment(db, job.ownerId, id, job.targetThingId, true);
      const file = await attachmentsDb.getOwnedAttachmentOrThrow(db, job.ownerId, id);
      if (
        file.mediaType.startsWith('image/') &&
        !thing.imageAttachmentId &&
        !thing.data.userEdited?.includes('imageAttachmentId')
      )
        await database.execute(
          db,
          'update bt.things set image_attachment_id=$1 where id=$2 and owner_id=$3',
          [id, thing.id, job.ownerId],
        );
      await importsDb.addSource(db, job, id);
      job.workflow.resourceIds = [...new Set([...job.workflow.resourceIds, id])];
      await importsDb.saveWorkflow(db, job, job.workflow);
      this.job = job;
    });
    this.publish();
  }

  // Distinguishes evidence snapshots so retries revisit batches after source changes.
  private sourceFingerprint() {
    return createHash('sha256')
      .update(
        JSON.stringify(
          this.sources
            .map((file) => [file.id, file.transcriptionCompletedAt, file.transcription])
            .sort(),
        ),
      )
      .digest('hex')
      .slice(0, 16);
  }

  // Prevents stale source content or removed links from justifying automatic writes.
  private async isSourceCurrent(db: Database, thing: thingsDb.ThingRow, id: string) {
    const original = this.sources.find((source) => source.id === id);
    const linked = await database.execute(
      db,
      'select 1 from bt.thing_attachments where thing_id=$1 and owner_id=$2 and attachment_id=$3',
      [thing.id, thing.ownerId, id],
    );
    if (!original || !linked.rowCount) return false;
    const current = await attachmentsDb.getOwnedAttachmentOrThrow(db, thing.ownerId, id, {
      lock: true,
    });
    return (
      current.transcription === original.transcription &&
      current.transcriptionCompletedAt === original.transcriptionCompletedAt
    );
  }

  // Reads linked source content once for fieldset selection and population.
  private async readLinkedSources() {
    metrics.setJobStage('read_linked_sources');
    const thing = await this.thing();
    const links = await database.rows<{ attachmentId: string }>(
      this.pool,
      'select attachment_id from bt.thing_attachments where thing_id=$1 and owner_id=$2',
      [thing.id, this.job.ownerId],
    );
    if (links.length > 20)
      await this.warning('source_limit', null, 'RESEARCH_FAILED', 'source_limit');
    this.sources = (
      await Promise.all(
        links
          .slice(0, 20)
          .map((link) =>
            attachmentsDb.getOwnedAttachmentOrThrow(this.pool, this.job.ownerId, link.attachmentId),
          ),
      )
    ).filter(
      (file) =>
        (file.ownerId !== null || !file.mediaType.startsWith('image/')) &&
        (file.transcription || file.transcriptionSummary) &&
        ['COMPLETE', 'PARTIAL'].includes(file.transcriptionStatus),
    );
  }
  // Checks applicability and records cited public coverage for shared-resource reuse.
  private async assessSources() {
    if (!this.ai.assessResource) return;
    metrics.setJobStage('assess_source');
    const thing = await this.thing();
    for (const source of this.sources.filter((file) => file.ownerId === null)) {
      const key = 'applicability:' + source.id + ':' + this.sourceFingerprint();
      if (this.job.workflow.done.includes(key)) continue;
      let result;
      try {
        result = await this.ai.assessResource(
          {
            categoryId: thing.categoryId,
            knownFields: publicFields(thing.data, this.registry),
            identifierFields: [...this.registry.fields.values()].filter(
              (field) => field.isIdentifier && field.scope !== 'INSTANCE',
            ),
            source: {
              attachmentId: source.id,
              summary: source.transcriptionSummary,
              terms: source.transcriptionTerms,
              identifiers: source.identifierObservations,
            },
          },
          this.createTaskContext(thing.categoryId),
        );
      } catch (error) {
        if (error instanceof UsagePersistenceError) throw error;
        this.context.signal.throwIfAborted();
        await this.warning(key, source.sourceUrl, 'RESEARCH_FAILED', getImportFailureReason(error));
        this.job.workflow.excludedIds = this.job.workflow.excludedIds.filter(
          (id) => id !== source.id,
        );
        await importsDb.saveWorkflow(this.pool, this.job, this.job.workflow);
        continue;
      }
      result.identifiers = mapValidResults(result.identifiers, (identifier) => {
        ensure(
          identifier.attachmentId === source.id &&
            this.registry.fields.get(identifier.fieldId)?.isIdentifier &&
            ['CLASS', 'GROUP'].includes(this.registry.fields.get(identifier.fieldId)?.scope ?? ''),
          'Invalid public identifier',
        );
        this.evidence(identifier);
        return identifier;
      });
      await this.commit(key, async (db, current) => {
        if (!(await this.isSourceCurrent(db, current, source.id))) return;
        await attachmentsDb.saveCoverage(
          db,
          source.id,
          result.identifiers.map(({ fieldId, value }) => ({ fieldId, value })),
        );
        this.job.workflow.excludedIds = result.applicable
          ? this.job.workflow.excludedIds.filter((id) => id !== source.id)
          : [...new Set([...this.job.workflow.excludedIds, source.id])];
        const stored = await importsDb.getOwnedImportOrThrow(db, this.job.ownerId, this.job.id);
        await importsDb.saveWorkflow(db, stored, {
          ...stored.workflow,
          excludedIds: this.job.workflow.excludedIds,
        });
      });
    }
    this.sources = this.sources.filter(
      (source) => !this.job.workflow.excludedIds.includes(source.id),
    );
  }

  // Selects optional fieldsets using all available linked-source summaries.
  private async selectFields() {
    const key = 'fieldsets:' + this.sourceFingerprint();
    if (this.job.workflow.done.includes(key)) return;
    await this.stage('SELECTING_FIELDSETS', 'MAPPING');
    const thing = await this.thing(),
      candidate = this.job.workflow.selected!;
    let selection;
    try {
      selection = await this.ai.selectFieldSets(
        {
          ...candidate,
          name: thing.name,
          identifiers: undefined,
          facts: [],
          knownFields: publicFields(thing.data, this.registry),
          sources: this.sources.map((file) => ({
            attachmentId: file.id,
            summary: file.transcriptionSummary,
            terms: file.transcriptionTerms,
          })),
        },
        this.createTaskContext(thing.categoryId),
      );
    } catch (error) {
      if (error instanceof UsagePersistenceError) throw error;
      this.context.signal.throwIfAborted();
      await this.warning(key, null, 'RESEARCH_FAILED', getImportFailureReason(error));
      return;
    }
    selection.setIds = selection.setIds.filter(
      (id) => this.registry.sets.get(id)?.categoryId === thing.categoryId,
    );
    await this.commit(key, async (db, current) => {
      await thingsDb.saveThingData(
        db,
        current.ownerId,
        current.id,
        addFieldSets(current.data, current.categoryId, this.registry, selection.setIds),
      );
    });
  }

  // Searches enabled field targets and commits each validated result batch independently.
  private async populate() {
    await this.stage('POPULATING', 'MAPPING');
    ensure(this.ai.populateFields, 'Population is unavailable');
    const thing = await this.thing(),
      targets = fieldTargets(thing.data, this.registry);
    const fingerprint = this.sourceFingerprint();
    for (let offset = 0; offset < targets.length; offset += 20) {
      const fields = targets.slice(offset, offset + 20),
        key =
          'fields:' +
          fingerprint +
          ':' +
          fields.map((target) => `${target.fieldSetId}:${target.field.id}`).join('|');
      if (this.job.workflow.done.includes(key)) continue;
      let result;
      try {
        result = await this.ai.populateFields(
          {
            thing: {
              id: thing.id,
              name: thing.name,
              categoryId: thing.categoryId,
              identifiers: identifierValues(thing.data, this.registry),
            },
            sources: this.sources.map((file) => ({
              attachmentId: file.id,
              summary: file.transcriptionSummary,
              terms: file.transcriptionTerms,
            })),
            fields,
          },
          this.createTaskContext(thing.categoryId),
        );
      } catch (error) {
        if (error instanceof UsagePersistenceError) throw error;
        this.context.signal.throwIfAborted();
        await this.warning(key, null, 'RESEARCH_FAILED', getImportFailureReason(error));
        continue;
      }
      result.pinnedFields = result.pinnedFields.filter((pin) =>
        fields.some(
          (target) => target.fieldSetId === pin.fieldSetId && target.field.id === pin.fieldId,
        ),
      );
      const values: FieldProposal[] = mapValidResults(result.values, (value) => {
        ensure(
          fields.some(
            (target) => target.fieldSetId === value.fieldSetId && target.field.id === value.fieldId,
          ),
          'Unrequested field',
        );
        this.registry.validate(value.fieldId, value.value);
        const sourceRefs = mapValidResults(value.sourceRefs, (ref) => this.evidence(ref));
        const citedSources = value.sourceRefs.flatMap((ref) =>
          this.sources.filter((file) => file.id === ref.attachmentId),
        );
        const sources = citedSources.length ? citedSources : this.sources;
        ensure(
          sources.every((source) => source.ownerId !== null) ||
            ['GROUP', 'CLASS'].includes(this.registry.fields.get(value.fieldId)?.scope ?? ''),
          'Public source supplied instance data',
        );
        return {
          ...value,
          sourceRefs,
          origin: sources.some((source) => source.ownerId === null) ? 'DISCOVERY' : 'IMPORT',
        };
      });
      await this.commit(key, async (db, current) => {
        const staleIds = new Set<string>();
        for (const id of new Set(
          values.flatMap((value) => value.sourceRefs.map((ref) => ref.attachmentId)),
        )) {
          ensure(id, 'Invalid source evidence');
          if (!(await this.isSourceCurrent(db, current, id))) staleIds.add(id);
        }
        const accepted = values.filter(
          (value) =>
            !value.sourceRefs.some((ref) => ref.attachmentId && staleIds.has(ref.attachmentId)),
        );
        const data = populateFields(current.data, accepted, this.registry);
        if (!data.userEdited?.includes('pins'))
          for (const pin of result.pinnedFields) {
            const value =
              pin.fieldSetId === null
                ? data.standalone[pin.fieldId]?.value
                : data.values[pin.fieldSetId]?.[pin.fieldId]?.value;
            if (
              value != null &&
              data.pins.length < 3 &&
              !data.pins.some(
                (existing) =>
                  existing.fieldSetId === pin.fieldSetId && existing.fieldId === pin.fieldId,
              )
            )
              data.pins.push(pin);
          }
        await thingsDb.saveThingData(db, current.ownerId, current.id, data);
      });
    }
  }

  // Saves only significant owner-source findings and reuses existing field occurrences.
  private async additional() {
    if (!this.ai.additionalInformation) return;
    this.job.workflow.warnings = this.job.workflow.warnings.filter(
      ({ stage }) => !stage.startsWith('additional:'),
    );
    await this.stage('ADDITIONAL_INFORMATION', 'MAPPING');
    const fingerprint = this.sourceFingerprint();
    for (const source of this.sources.filter((source) => source.ownerId !== null))
      for (let offset = 0; offset < (source.transcription?.length ?? 0);) {
        const start = offset;
        const prefix = `additional:${source.id}:${fingerprint}:${start}:`;
        const completed = this.job.workflow.done.find((key) => key.startsWith(prefix));
        if (completed) {
          offset = Number(completed.slice(prefix.length));
          continue;
        }
        const thing = await this.thing();
        const known = [
          ...Object.values(thing.data.values).flatMap((values) => Object.keys(values)),
          ...Object.keys(thing.data.standalone),
        ]
          .map((id) => this.registry.fields.get(id)?.name ?? id)
          .concat(thing.data.customFields.map((field) => field.label));
        const input = getAdditionalInformationBatch(
          {
            thing: {
              name: thing.name,
              categoryId: thing.categoryId,
              identifiers: identifierValues(thing.data, this.registry),
            },
            knownFields: known,
            attachmentId: source.id,
          },
          source.transcription!.slice(start),
        );
        if (!input.text.length) {
          await this.warning(prefix + start, null, 'RESEARCH_FAILED', 'text_limit');
          break;
        }
        offset += input.text.length;
        const key = prefix + offset;
        const batchStarted = Date.now();
        const context = this.createTaskContext(thing.categoryId);
        const beforeRequest = context.beforeRequest;
        let modelCalls = 0;
        context.beforeRequest = () => {
          beforeRequest?.();
          modelCalls++;
        };
        let result;
        let failureReason: string | undefined;
        try {
          result = await this.ai.additionalInformation(input, context);
          result.findings = mapValidResults(result.findings, (value) => {
            ensure(value.attachmentId === source.id, 'Wrong additional source');
            this.evidence(value);
            ensure(
              value.label.length > 0 && value.label.length <= 160 && value.reason.trim(),
              'Invalid additional information',
            );
            if (value.fieldId) {
              const definition = this.registry.fields.get(value.fieldId);
              ensure(
                definition &&
                  [...this.registry.sets.values()].some(
                    (set) =>
                      set.categoryId === thing.categoryId &&
                      set.fields.some((field) => field.id === value.fieldId),
                  ) &&
                  (!value.sensitive || definition.sensitive),
                'Invalid additional field',
              );
              this.registry.validate(value.fieldId, value.value);
            }
            return value;
          });
        } catch (error) {
          failureReason = this.context.signal.aborted
            ? this.context.cancellationReason?.()
            : getImportFailureReason(error);
          if (error instanceof UsagePersistenceError) throw error;
          this.context.signal.throwIfAborted();
          await this.warning(key, null, 'RESEARCH_FAILED', failureReason);
          continue;
        } finally {
          metrics.recordImportDiagnostic('additional_information_batch', {
            attachmentId: source.id,
            start,
            end: offset,
            elapsedMs: Date.now() - batchStarted,
            modelCalls,
            toolCalls: context.toolCalls,
            failureReason,
          });
        }
        await this.commit(key, async (db, current) => {
          if (!(await this.isSourceCurrent(db, current, source.id))) return;
          let data = structuredClone(current.data);
          for (const finding of result.findings) {
            const refs = [this.evidence(finding)];
            if (finding.fieldId) {
              const existing = Object.keys(data.values).find((id) =>
                Object.hasOwn(data.values[id], finding.fieldId!),
              );
              data = populateFields(
                data,
                [
                  {
                    fieldSetId: existing ?? null,
                    fieldId: finding.fieldId,
                    value: finding.value,
                    sourceRefs: refs,
                  },
                ],
                this.registry,
              );
            } else {
              if (known.some((label) => label.toLowerCase() === finding.label.toLowerCase()))
                continue;
              const existing = data.customFields.find(
                (field) => field.label.toLowerCase() === finding.label.toLowerCase(),
              );
              if (existing?.autoPopulate === false || existing?.origin === 'USER') continue;
              const valueType =
                existing?.valueType ?? finding.valueType ?? inferCustomValueType(finding.value);
              if (!isCustomValue(finding.value, valueType)) continue;
              const hex = createHash('sha256')
                .update(`${current.id}:${source.id}:${finding.label.toLowerCase()}`)
                .digest('hex');
              const id =
                existing?.id ??
                `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
              if (data.userEdited?.includes('local:' + id)) continue;
              data.customFields = data.customFields.filter((field) => field.id !== id);
              data.customFields.push({
                id,
                label: finding.label,
                value: finding.value,
                valueType,
                sensitive: finding.sensitive,
                scope: 'INSTANCE',
                origin: 'IMPORT',
                sourceRefs: refs,
                autoPopulate: true,
              });
            }
          }
          await thingsDb.saveThingData(db, current.ownerId, current.id, data);
        });
      }
  }

  // Runs the same cited Recommendation operations for Imports and standalone requests.
  private async recommend() {
    await this.stage('RECOMMENDING', 'RECOMMENDING');
    const thing = await this.thing();
    const fieldSetsWithSuggestions = thing.data.setIds.flatMap((fieldSetId) => {
      const suggestions = this.registry.recommendationSuggestionsByFieldSet.get(fieldSetId);
      return suggestions ? [{ fieldSetId, ...suggestions }] : [];
    });
    const research = {
      name: thing.name,
      categoryId: thing.categoryId,
      knownFields: publicFields(thing.data, this.registry),
      fields: [
        ...Object.values(thing.data.values).flatMap((values) => Object.entries(values)),
        ...Object.entries(thing.data.standalone),
      ].map(([id, field]) => {
        const definition = this.registry.fields.get(id);
        return {
          id,
          label: definition?.name ?? id,
          description: definition?.description ?? '',
          schema: definition?.schema ?? null,
          value: field.value,
        };
      }),
      sources: this.sources.map((file) => ({
        attachmentId: file.id,
        summary: file.transcriptionSummary,
        terms: file.transcriptionTerms,
      })),
      referenceUrls: [
        ...new Set(this.sources.flatMap((file) => (file.sourceUrl ? [file.sourceUrl] : []))),
      ],
    } satisfies RecommendationInput;

    // Omit unusable citations while keeping each suggestion available for validation.
    const cite = <T extends { sourceRefs: SourceRef[] }>(item: T): T => {
      return {
        ...item,
        sourceRefs: mapValidResults(item.sourceRefs, (ref) => {
          if (ref.attachmentId) return this.evidence(ref);
          ensure(ref.url && publicUrl(ref.url), 'Invalid source evidence');
          return { ...ref, quote: ref.quote?.slice(0, 2000) };
        }),
      };
    };
    const [tasks, purchasables] = await Promise.allSettled([
      this.job.workflow.done.includes('tasks')
        ? undefined
        : tasksDb
            .existingTasks(this.pool, this.job.ownerId, thing.id)
            .then((existingTasks) =>
              this.ai.suggestTasks(
                {
                  ...research,
                  existingTasks,
                  fieldSetSuggestions: fieldSetsWithSuggestions.flatMap(({ fieldSetId, tasks }) =>
                    tasks.map((task) => ({ fieldSetId, ...task })),
                  ),
                },
                this.createTaskContext(thing.categoryId),
              ),
            )
            .then((result) => ({
              items: mapValidResults(result.items, (task) => {
                ensure(
                  task.title.length <= 200 && task.description.length <= 4000,
                  'Invalid recommendation',
                );
                return cite(task);
              }),
            })),
      this.job.workflow.done.includes('purchasables')
        ? undefined
        : purchasablesDb
            .existingPurchasables(this.pool, this.job.ownerId, thing.id)
            .then((existingPurchasables) =>
              this.ai.findPurchasables(
                {
                  ...research,
                  existingPurchasables,
                  fieldSetSuggestions: fieldSetsWithSuggestions.flatMap(
                    ({ fieldSetId, purchasables }) =>
                      purchasables.map((product) => ({ fieldSetId, ...product })),
                  ),
                },
                this.createTaskContext(thing.categoryId),
              ),
            )
            .then((result) => ({
              items: mapValidResults(result.items, (product) => {
                ensure(
                  product.name.length <= 200 && product.description.length <= 4000,
                  'Invalid recommendation',
                );
                ensure(publicUrl(product.merchantUrl), 'Uncited purchase URL');
                return cite(product);
              }),
            })),
    ]);
    this.context.signal.throwIfAborted();

    // Record optional failures and commit each successful result in sequence.
    for (const [stage, result] of [
      ['tasks', tasks],
      ['purchasables', purchasables],
    ] as const) {
      if (result.status === 'rejected') {
        if (result.reason instanceof UsagePersistenceError) throw result.reason;
        await this.warning(stage, null, 'RESEARCH_FAILED', getImportFailureReason(result.reason));
      }
    }
    if (tasks.status === 'fulfilled' && tasks.value) {
      const result = tasks.value;
      const saved: metrics.DiagnosticEntity[] = [];
      await this.commit('tasks', async (db, current) => {
        tasks: for (const task of result.items) {
          for (const ref of task.sourceRefs)
            if (ref.attachmentId && !(await this.isSourceCurrent(db, current, ref.attachmentId)))
              continue tasks;
          const id = await tasksDb.saveSuggestedTask(db, current.ownerId, current.id, task);
          if (id) saved.push({ type: 'task', id, name: task.title });
        }
      });
      metrics.recordImportDiagnostic('task_recommendations_saved', {
        acceptedCount: result.items.length,
        savedCount: saved.length,
      });
      for (const task of saved) metrics.recordImportDiagnostic('suggested_task_saved', {}, task);
    }
    if (purchasables.status === 'fulfilled' && purchasables.value) {
      const result = purchasables.value;
      const saved: metrics.DiagnosticEntity[] = [];
      await this.commit('purchasables', async (db, current) => {
        products: for (const product of result.items) {
          for (const ref of product.sourceRefs)
            if (ref.attachmentId && !(await this.isSourceCurrent(db, current, ref.attachmentId)))
              continue products;
          const id = await purchasablesDb.saveSuggestedPurchasable(
            db,
            current.ownerId,
            current.id,
            product,
          );
          if (id) saved.push({ type: 'purchasable', id, name: product.name });
        }
      });
      metrics.recordImportDiagnostic('purchasable_recommendations_saved', {
        acceptedCount: result.items.length,
        savedCount: saved.length,
      });
      for (const product of saved)
        metrics.recordImportDiagnostic('suggested_purchasable_saved', {}, product);
    }
  }
}
