/** Coordinates one Thing's identity, public research, shared field population and cited recommendations. */
import { randomUUID, createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import type pg from 'pg';
import type { Registry } from '../registry/registry.js';
import type { BlobStorage } from '../../providers/blobs/index.js';
import type { EnvConfig } from '../../config.js';
import type { ApplicationEvents } from '../events.js';
import { UsagePersistenceError } from './types.js';
import type {
  ImportAi,
  WorkflowTools,
  ResolutionInput,
  ThingCandidate,
  SourceRecommendations,
} from './types.js';
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
import * as activityDb from '../../db/entities/activity.js';
import * as purchasablesDb from '../../db/entities/purchasables.js';
import { addFieldSets, fieldTargets, populateFields, identifierValues } from '../thing-fields.js';
import { publicFields } from '../public-fields.js';
import { searchFields, searchFieldSets } from '../registry/index.js';
import { ensure } from '../errors.js';
import { publicUrl } from '../../providers/web/resources.js';
import { downloadPdf } from '../../providers/web/pdf.js';
import { downloadImage } from '../../providers/web/image.js';
import { validateResource, saveResourceAttachment, resourceKey } from './resources.js';
import { IcecatProvider, type SpecialistProvider } from './specialists.js';

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
    private config: EnvConfig,
    private events: ApplicationEvents,
    private job: ImportRow,
    private context: AiContext,
    private options: WorkflowOptions,
  ) {}

  // Executes unfinished stages while preserving the selected Thing and completed batches.
  async run() {
    this.sources = await importsDb.listImportSources(this.pool, this.job);
    await this.identity();
    for (const source of this.job.sources) {
      if (source.status === 'FAILED')
        await this.warning('source:' + source.attachmentId, null, 'EXTRACTION_FAILED');
      else await this.commit('source:' + source.attachmentId);
    }
    if (this.job.operation === 'IMPORT') {
      await this.specialists();
      await this.research();
      await this.readLinkedSources();
      await this.assessSources();
      await this.selectFields();
      await this.populate();
      await this.additional();
    }
    await this.readLinkedSources();
    await this.assessSources();
    await this.recommend();
    await importsDb.setImportStatus(this.pool, this.job.ownerId, this.job.id, 'COMPLETE');
    this.publish();
  }

  // Publishes progress after persisted changes are visible.
  private publish() {
    this.events.publish({ type: 'data.changed', ownerId: this.job.ownerId });
  }

  // Reads the selected Thing using the request's ownership boundary.
  private thing() {
    ensure(this.job.targetThingId, 'no_thing_identified');
    return thingsDb.getOwnedThingOrThrow(this.pool, this.job.ownerId, this.job.targetThingId);
  }

  // Saves application changes and their completion record under the same transaction.
  private async commit(
    key: string,
    work?: (db: Database, current: thingsDb.ThingRow) => Promise<void>,
  ) {
    this.context.signal.throwIfAborted();
    await database.transaction(this.pool, async (db) => {
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
    });
    this.publish();
  }

  // Records a visible stage before issuing external work.
  private async stage(stage: string, status: ImportRow['status']) {
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
    this.job.workflow.warnings.push({ stage, warning });
    await importsDb.saveWorkflow(this.pool, this.job, this.job.workflow);
    this.publish();
  }

  // Provides bounded evidence and registry retrieval for this request's authorised sources.
  private tools(
    category: string,
    retrievedSets?: Set<string>,
    retrievedFields?: Set<string>,
  ): WorkflowTools {
    let calls = 0;
    const record = async (name: string, count: number, truncated = false) => {
      ensure(++calls <= this.config.importToolRounds, 'tool_limit');
      await this.context.record({ toolCalls: [{ name, resultCount: count, truncated }] });
    };
    return {
      searchTranscription: async (id, query, offset) => {
        const source = this.sources.find((source) => source.id === id);
        ensure(
          source && query.length <= 200 && Number.isInteger(offset) && offset >= 0,
          'Invalid source search',
        );
        const text = source.transcription ?? '';
        const found = query ? text.toLowerCase().indexOf(query.toLowerCase(), offset) : offset;
        const start = Math.max(0, (found < 0 ? offset : found) - 200);
        const content = text.slice(start, start + 6000);
        await record('search_transcription', content ? 1 : 0, start + 6000 < text.length);
        return {
          attachmentId: id,
          text: content,
          offset: start,
          nextOffset: start + 6000 < text.length ? start + 6000 : null,
        };
      },
      searchFieldSets: async (id, terms) => {
        ensure(id === category, 'Wrong category');
        const result = await searchFieldSets(this.pool, this.registry, id, terms);
        result.sets.forEach((set) => retrievedSets?.add(set.id));
        await record('search_field_sets', result.sets.length, result.truncated);
        return result;
      },
      searchFields: async (labels) => {
        const result = await searchFields(this.pool, this.registry, labels);
        result.results
          .flatMap((result) => result.fields)
          .forEach((field) => retrievedFields?.add(field.id));
        await record('search_fields', result.results.length, result.truncated);
        return result;
      },
    };
  }

  // Validates cited source IDs, original pages and verbatim quotations before field writes.
  private evidence(value: {
    attachmentId?: string;
    page?: number | null;
    quote?: string;
  }): SourceRef {
    const page = value.page ?? null;
    const source = this.sources.find((source) => source.id === value.attachmentId);
    ensure(
      source &&
        typeof value.quote === 'string' &&
        value.quote.trim().length > 0 &&
        value.quote.length <= 2000 &&
        source.transcription?.includes(value.quote),
      'Invalid source evidence',
    );
    ensure(
      page === null ||
        (Number.isInteger(page) && page > 0 && (!source.pageCount || page <= source.pageCount)),
      'Invalid source page',
    );
    if (
      page !== null &&
      source.mediaType === 'application/pdf' &&
      /\[PDF page \d+\]/.test(source.transcription ?? '')
    ) {
      const text = source.transcription ?? '',
        marker = `[PDF page ${page}]`,
        start = text.indexOf(marker);
      const end = text.indexOf('[PDF page ', start + marker.length);
      ensure(
        start >= 0 && text.slice(start, end < 0 ? undefined : end).includes(value.quote),
        'Quote does not match source page',
      );
    }
    return {
      attachmentId: source.id,
      ...(page !== null ? { page: page } : {}),
      quote: value.quote,
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
        source.transcription && ['COMPLETE', 'PARTIAL'].includes(source.transcriptionStatus),
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
                .filter((field) => (field.identifierKind ?? 'NONE') !== 'NONE')
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
        this.tools(this.job.targetThingId ? (await this.thing()).categoryId : ''),
        this.context,
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
      for (const identifier of candidate.identifiers) {
        ensure(
          categories
            .find((category) => category.id === candidate.categoryId)
            ?.identifiers.some((field) => field.id === identifier.fieldId),
          'Invalid identifier',
        );
        const source = this.sources.find((file) => file.id === identifier.attachmentId);
        ensure(
          source?.ownerId !== null ||
            this.registry.fields.get(identifier.fieldId)?.instanceSpecific === false,
          'Public source supplied instance data',
        );
        this.evidence(identifier);
      }
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
          (entry) => this.registry.fields.get(entry.fieldId)?.identifierKind === 'CLASS',
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
    const providers =
      this.options.specialists ??
      (this.config.icecatAccessToken ? [new IcecatProvider(this.config.icecatAccessToken)] : []);
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
        await this.warning(key);
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
          this.registry.fields.get(field.fieldId)?.identifierKind === 'CLASS' &&
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
          this.config.discoverySearchCalls,
        );
      } catch (error) {
        if (error instanceof UsagePersistenceError) throw error;
        this.context.signal.throwIfAborted();
        await this.warning('research');
        return;
      }
      this.job.workflow.discovery = discovery;
      await importsDb.saveWorkflow(this.pool, this.job, this.job.workflow);
    }
    for (const item of this.job.workflow.discovery?.items.slice(
      0,
      this.config.importMaxResources,
    ) ?? []) {
      const key = 'resource:' + resourceKey(item);
      if (this.job.workflow.done.includes(key)) continue;
      let id = (
        await attachmentsDb.findDiscoveryAttachment(this.pool, this.job.ownerId, resourceKey(item))
      )?.id;
      if (!id) {
        let content: { content: Buffer; mediaType: string } | null | undefined;
        try {
          validateResource(item, this.job.workflow.discovery!.sources);
          if (item.kind === 'reference') {
            const bytes = await (this.options.download ?? downloadPdf)(item.url, {
              maxBytes: this.config.maxUploadBytes,
              signal: this.context.signal,
            });
            ensure(bytes, 'Document unavailable');
            content = { content: bytes, mediaType: 'application/pdf' };
          } else
            content = await (this.options.downloadImage ?? downloadImage)(item.url, {
              maxBytes: this.config.maxUploadBytes,
              signal: this.context.signal,
            });
          ensure(content, 'Resource unavailable');
        } catch (error) {
          if (error instanceof UsagePersistenceError) throw error;
          this.context.signal.throwIfAborted();
          await this.warning(key, item.url, 'UNAVAILABLE');
          continue;
        }
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
    }
    const waiting = AbortSignal.any([
      this.context.signal,
      AbortSignal.timeout(this.config.discoveryTimeoutMs),
    ]);
    try {
      for (;;) {
        const files = await importsDb.listImportSources(this.pool, this.job);
        if (
          !files.some(
            (file) =>
              this.job.workflow.resourceIds.includes(file.id) &&
              ['PENDING', 'PROCESSING'].includes(file.transcriptionStatus),
          )
        )
          break;
        await setTimeout(100, undefined, { signal: waiting });
      }
    } catch {
      this.context.signal.throwIfAborted();
      await this.warning('research', null, 'TIMEOUT');
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
  private async assertSourceCurrent(db: Database, thing: thingsDb.ThingRow, id: string) {
    const original = this.sources.find((source) => source.id === id);
    const linked = await database.execute(
      db,
      'select 1 from bt.thing_attachments where thing_id=$1 and owner_id=$2 and attachment_id=$3',
      [thing.id, thing.ownerId, id],
    );
    ensure(original && linked.rowCount, 'source_removed');
    const current = await attachmentsDb.getOwnedAttachmentOrThrow(db, thing.ownerId, id, {
      lock: true,
    });
    ensure(
      current.transcription === original.transcription &&
        current.transcriptionCompletedAt === original.transcriptionCompletedAt,
      'source_changed',
    );
  }

  // Reads linked source content once for fieldset selection and population.
  private async readLinkedSources() {
    const thing = await this.thing();
    const links = await database.rows<{ attachmentId: string }>(
      this.pool,
      'select attachment_id from bt.thing_attachments where thing_id=$1 and owner_id=$2',
      [thing.id, this.job.ownerId],
    );
    if (links.length > 20) await this.warning('source_limit', null, 'RESEARCH_FAILED');
    this.sources = (
      await Promise.all(
        links
          .slice(0, 20)
          .map((link) =>
            attachmentsDb.getOwnedAttachmentOrThrow(this.pool, this.job.ownerId, link.attachmentId),
          ),
      )
    ).filter(
      (file) => file.transcription && ['COMPLETE', 'PARTIAL'].includes(file.transcriptionStatus),
    );
  }
  // Checks applicability and records cited public coverage for shared-resource reuse.
  private async assessSources() {
    if (!this.ai.assessResource) return;
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
            identifierFields: [...this.registry.fields.values()].filter((field) =>
              ['CLASS', 'GROUP'].includes(field.identifierKind ?? ''),
            ),
            source: {
              attachmentId: source.id,
              summary: source.transcriptionSummary,
              terms: source.transcriptionTerms,
              identifiers: source.identifierObservations,
            },
          },
          this.tools(thing.categoryId),
          this.context,
        );
      } catch (error) {
        if (error instanceof UsagePersistenceError) throw error;
        this.context.signal.throwIfAborted();
        await this.warning(key, source.sourceUrl);
        this.job.workflow.excludedIds = [...new Set([...this.job.workflow.excludedIds, source.id])];
        await importsDb.saveWorkflow(this.pool, this.job, this.job.workflow);
        continue;
      }
      for (const identifier of result.identifiers) {
        ensure(
          identifier.attachmentId === source.id &&
            ['CLASS', 'GROUP'].includes(
              this.registry.fields.get(identifier.fieldId)?.identifierKind ?? '',
            ),
          'Invalid public identifier',
        );
        this.evidence(identifier);
      }
      await this.commit(key, async (db, current) => {
        await this.assertSourceCurrent(db, current, source.id);
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
    const retrieved = new Set(thing.data.setIds);
    const selection = await this.ai.selectFieldSets(
      {
        ...candidate,
        identifiers: undefined,
        facts: [],
        knownFields: publicFields(thing.data, this.registry),
        sources: this.sources.map((file) => ({
          attachmentId: file.id,
          summary: file.transcriptionSummary,
          terms: file.transcriptionTerms,
        })),
      },
      this.tools(thing.categoryId, retrieved),
      this.context,
    );
    ensure(
      selection.setIds.every(
        (id) => retrieved.has(id) && this.registry.sets.get(id)?.categoryId === thing.categoryId,
      ),
      'Invalid fieldset selection',
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
      const result = await this.ai.populateFields(
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
        this.tools(thing.categoryId),
        this.context,
      );
      ensure(
        result.pinnedFields.every((pin) =>
          fields.some(
            (target) => target.fieldSetId === pin.fieldSetId && target.field.id === pin.fieldId,
          ),
        ),
        'Unrequested pin',
      );
      const values: FieldProposal[] = result.values.map((value) => {
        ensure(
          fields.some(
            (target) => target.fieldSetId === value.fieldSetId && target.field.id === value.fieldId,
          ),
          'Unrequested field',
        );
        ensure(value.sourceRefs.length > 0, 'Invalid source evidence');
        const sourceRefs = value.sourceRefs.map((ref) => this.evidence(ref));
        const sources = sourceRefs.map((ref) =>
          this.sources.find((file) => file.id === ref.attachmentId)!,
        );
        ensure(
          sources.every((source) => source.ownerId !== null) ||
            this.registry.fields.get(value.fieldId)?.instanceSpecific === false,
          'Public source supplied instance data',
        );
        return {
          ...value,
          sourceRefs,
          origin: sources.some((source) => source.ownerId === null) ? 'DISCOVERY' : 'IMPORT',
        };
      });
      await this.commit(key, async (db, current) => {
        for (const id of new Set(
          values.flatMap((value) => value.sourceRefs.map((ref) => ref.attachmentId)),
        )) {
          ensure(id, 'Invalid source evidence');
          await this.assertSourceCurrent(db, current, id);
        }
        const data = populateFields(current.data, values, this.registry);
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
    await this.stage('ADDITIONAL_INFORMATION', 'MAPPING');
    for (const source of this.sources.filter((source) => source.ownerId !== null))
      for (let offset = 0; offset < (source.transcription?.length ?? 0); offset += 20000) {
        const key = `additional:${source.id}:${this.sourceFingerprint()}:${offset}`;
        if (this.job.workflow.done.includes(key)) continue;
        const thing = await this.thing();
        const known = [
          ...Object.values(thing.data.values).flatMap((values) => Object.keys(values)),
          ...Object.keys(thing.data.standalone),
        ]
          .map((id) => this.registry.fields.get(id)?.name ?? id)
          .concat(thing.data.customFields.map((field) => field.label));
        const retrieved = new Set<string>();
        const result = await this.ai.additionalInformation(
          {
            thing: {
              name: thing.name,
              categoryId: thing.categoryId,
              identifiers: identifierValues(thing.data, this.registry),
            },
            knownFields: known,
            attachmentId: source.id,
            text: source.transcription!.slice(offset, offset + 20000),
          },
          this.tools(thing.categoryId, undefined, retrieved),
          this.context,
        );
        result.findings.forEach((value) => {
          ensure(value.attachmentId === source.id, 'Wrong additional source');
          this.evidence(value);
        });
        await this.commit(key, async (db, current) => {
          await this.assertSourceCurrent(db, current, source.id);
          let data = structuredClone(current.data);
          for (const finding of result.findings) {
            ensure(
              finding.label.length > 0 && finding.label.length <= 160 && finding.reason.trim(),
              'Invalid additional information',
            );
            const refs = [this.evidence(finding)];
            if (finding.fieldId) {
              const definition = this.registry.fields.get(finding.fieldId);
              ensure(
                definition &&
                  retrieved.has(finding.fieldId) &&
                  (!finding.sensitive || definition.sensitive),
                'Invalid additional field',
              );
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
                sensitive: finding.sensitive,
                instanceSpecific: true,
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
    const sourceKey = 'sourceRecommendations:' + this.sourceFingerprint();
    if (
      this.sources.length &&
      this.ai.recommendFromSources &&
      !this.job.workflow.done.includes(sourceKey)
    ) {
      let result: SourceRecommendations | undefined;
      try {
        result = await this.ai.recommendFromSources(
          {
            thing: {
              name: thing.name,
              categoryId: thing.categoryId,
              identifiers: identifierValues(thing.data, this.registry),
            },
            fields: [
              ...Object.values(thing.data.values).flatMap((values) => Object.entries(values)),
              ...Object.entries(thing.data.standalone),
            ].map(([id, field]) => ({ id, value: field.value })),
            sources: this.sources.map((file) => ({
              attachmentId: file.id,
              summary: file.transcriptionSummary,
              terms: file.transcriptionTerms,
            })),
            existingTasks: await activityDb.existingTasks(this.pool, this.job.ownerId, thing.id),
            existingPurchasables: await purchasablesDb.existingPurchasables(
              this.pool,
              this.job.ownerId,
              thing.id,
            ),
          },
          this.tools(thing.categoryId),
          this.context,
        );
      } catch (error) {
        if (error instanceof UsagePersistenceError) throw error;
        this.context.signal.throwIfAborted();
        await this.warning(sourceKey);
      }
      if (result) {
        for (const item of [...result.tasks, ...result.purchasables]) {
          ensure(item.sourceRefs.length > 0, 'Invalid source evidence');
          item.sourceRefs = item.sourceRefs.map((ref) => this.evidence(ref));
        }
        await this.commit(sourceKey, async (db, current) => {
          for (const id of new Set(
            [...result.tasks, ...result.purchasables].flatMap((value) =>
              value.sourceRefs.map((ref) => ref.attachmentId),
            ),
          )) {
            ensure(id, 'Invalid source evidence');
            await this.assertSourceCurrent(db, current, id);
          }
          for (const task of result.tasks) {
            ensure(
              task.title.length <= 200 && task.description.length <= 4000,
              'Invalid recommendation',
            );
            await activityDb.saveSuggestedTask(db, current.ownerId, current.id, {
              title: task.title,
              description: task.description,
              sourceRefs: task.sourceRefs,
            });
          }
          for (const product of result.purchasables) {
            ensure(
              product.name.length <= 200 && product.description.length <= 4000,
              'Invalid recommendation',
            );
            const merchantUrl = product.merchantUrl;
            if (!merchantUrl) continue;
            ensure(
              publicUrl(merchantUrl) &&
                product.sourceRefs.some((ref) => ref.quote?.includes(merchantUrl)),
              'Uncited purchase URL',
            );
            await purchasablesDb.saveSuggestedPurchasable(db, current.ownerId, current.id, {
              kind: product.kind,
              name: product.name,
              description: product.description,
              merchantUrl,
              sourceRefs: product.sourceRefs,
            });
          }
        });
      }
    }
    const research = {
      name: this.job.workflow.selected?.attachmentIds.length
        ? this.job.workflow.selected.name
        : undefined,
      categoryId: thing.categoryId,
      knownFields: publicFields(thing.data, this.registry),
      referenceUrls: [
        ...new Set(this.sources.flatMap((file) => (file.sourceUrl ? [file.sourceUrl] : []))),
      ],
    };
    if (!this.job.workflow.done.includes('tasks')) {
      let result;
      try {
        result = await this.ai.suggestTasks(
          {
            ...research,
            existingTasks: await activityDb.existingTasks(this.pool, this.job.ownerId, thing.id),
          },
          this.context,
          this.config.discoverySearchCalls,
        );
      } catch (error) {
        if (error instanceof UsagePersistenceError) throw error;
        this.context.signal.throwIfAborted();
        await this.warning('tasks');
      }
      if (result)
        await this.commit('tasks', async (db, current) => {
          for (const task of result.items)
            await activityDb.saveSuggestedTask(db, current.ownerId, current.id, task);
        });
    }
    if (!this.job.workflow.done.includes('purchasables')) {
      let result;
      try {
        result = await this.ai.findPurchasables(
          {
            ...research,
            existingPurchasables: await purchasablesDb.existingPurchasables(
              this.pool,
              this.job.ownerId,
              thing.id,
            ),
          },
          this.context,
          this.config.discoverySearchCalls,
        );
      } catch (error) {
        if (error instanceof UsagePersistenceError) throw error;
        this.context.signal.throwIfAborted();
        await this.warning('purchasables');
      }
      if (result)
        await this.commit('purchasables', async (db, current) => {
          for (const product of result.items)
            await purchasablesDb.saveSuggestedPurchasable(db, current.ownerId, current.id, product);
        });
    }
  }
}
