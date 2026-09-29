import { apiData } from '../core/api/api-client';
import { Component, inject, signal, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import type { Schema, Pin, Value } from '../../shared/model';
import { Api, CONFIG, errorText } from '../app-services';
import { FieldEditor } from '../components/field';
import { Activity, type ActivityAction } from '../components/activity';
@Component({
  selector: 'bt-thing',
  imports: [FormsModule, RouterLink, FieldEditor, Activity],
  templateUrl: './thing.html',
})
export class ThingPage implements OnDestroy {
  readonly api = inject(Api);
  readonly config = inject(CONFIG);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private subscription: Subscription;
  thing = signal<Schema['Thing'] | null>(null);
  categories = signal<Schema['Category'][]>([]);
  sets = signal<Schema['FieldSet'][]>([]);
  fields = signal<Schema['FieldDefinition'][]>([]);
  tags = signal<Schema['Tag'][]>([]);
  attachments = signal<Schema['Attachment'][]>([]);
  library = signal<Schema['Attachment'][]>([]);
  issues = signal<Schema['Issue'][]>([]);
  events = signal<Schema['Event'][]>([]);
  purchasables = signal<Schema['Purchasable'][]>([]);
  busy = signal(false);
  error = signal('');
  imageUrl = signal('');
  deleting = signal(false);
  isNew = signal(true);
  loaded = signal(false);
  name = '';
  description = '';
  categoryId = 'other';
  selectedSet = '';
  newTag = '';
  newField = '';
  localLabel = '';
  localValue = '';
  localSensitive = false;
  linkId = '';
  id = '';
  private localCache = new WeakMap<Schema['UndefinedField'], Schema['Field']>();
  private standaloneCache: Schema['Field'] | null = null;
  constructor() {
    this.subscription = this.route.paramMap.subscribe((params) => {
      this.id = params.get('id') ?? '';
      this.isNew.set(!this.id);
      this.thing.set(null);
      this.loaded.set(false);
      this.deleting.set(false);
      this.library.set([]);
      if (this.imageUrl()) URL.revokeObjectURL(this.imageUrl());
      this.imageUrl.set('');
      void this.load();
    });
  }
  ngOnDestroy() {
    this.subscription.unsubscribe();
    if (this.imageUrl()) URL.revokeObjectURL(this.imageUrl());
  }
  async load() {
    const id = this.id;
    this.error.set('');
    try {
      const [categories, sets, fields, tags] = await Promise.all([
        this.api.all((query) => this.api.client.GET('/api/categories', { params: { query } })),
        this.api.all((query) => this.api.client.GET('/api/field-sets', { params: { query } })),
        this.api.all((query) => this.api.client.GET('/api/fields', { params: { query } })),
        this.api.all((query) => this.api.client.GET('/api/tags', { params: { query } })),
      ]);
      if (id !== this.id) return;
      this.categories.set(categories);
      this.sets.set(sets);
      this.fields.set(fields);
      this.tags.set(tags);
      if (id) {
        const [thing, attachments, issues, events, purchases] = await Promise.all([
          this.api.client.GET('/api/things/{id}', { params: { path: { id } } }).then(apiData),
          this.api.all((query) =>
            this.api.client.GET('/api/attachments', {
              params: { query: { ...query, thingId: id } },
            }),
          ),
          this.api.all((query) =>
            this.api.client.GET('/api/issues', { params: { query: { ...query, thingId: id } } }),
          ),
          this.api.all((query) =>
            this.api.client.GET('/api/events', { params: { query: { ...query, thingId: id } } }),
          ),
          this.api.all((query) =>
            this.api.client.GET('/api/purchasables', {
              params: { query: { ...query, thingId: id } },
            }),
          ),
        ]);
        if (id !== this.id) return;
        this.thing.set(thing);
        this.name = thing.name;
        this.description = thing.description;
        this.categoryId = thing.categoryId;
        this.attachments.set(attachments);
        this.issues.set(issues);
        this.events.set(events);
        this.purchasables.set(purchases);
        await this.loadImage();
      }
    } catch (e) {
      this.error.set(errorText(e));
    } finally {
      if (id === this.id) this.loaded.set(true);
    }
  }
  async loadImage() {
    if (this.imageUrl()) URL.revokeObjectURL(this.imageUrl());
    this.imageUrl.set('');
    const id = this.thing()?.imageAttachmentId;
    if (id) {
      const blob = await this.api.blob(id);
      if (this.thing()?.imageAttachmentId === id) this.imageUrl.set(URL.createObjectURL(blob));
    }
  }
  category() {
    return this.categories().find((c) => c.id === this.categoryId);
  }
  availableSets() {
    return this.sets().filter(
      (s) =>
        s.categoryId === (this.thing()?.categoryId ?? this.categoryId) &&
        !this.thing()?.fieldSets.some((selected) => selected.id === s.id),
    );
  }
  async perform(fn: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await fn();
    } catch (e) {
      this.error.set(errorText(e));
    } finally {
      this.busy.set(false);
    }
  }
  async saveBasics() {
    await this.perform(async () => {
      if (!this.id) {
        const t = await this.api.client
          .POST('/api/things', {
            body: {
              name: this.name,
              description: this.description,
              categoryId: this.categoryId,
              addFieldSetIds: this.selectedSet ? [this.selectedSet] : [],
            },
          })
          .then(apiData);
        await this.router.navigate(['/things', t.id]);
      } else
        await this.patch({
          name: this.name,
          description: this.description,
          categoryId: this.categoryId,
        });
    });
  }
  async patch(patch: Schema['ThingPatch']) {
    const id = this.id;
    const result = await this.api.client
      .PATCH('/api/things/{id}', { params: { path: { id } }, body: patch })
      .then(apiData);
    if (id === this.id) {
      this.thing.set(result);
      await this.loadImage();
    }
  }
  update(patch: Schema['ThingPatch']) {
    void this.perform(() => this.patch(patch));
  }
  addSet() {
    if (this.selectedSet) this.update({ addFieldSetIds: [this.selectedSet] });
    this.selectedSet = '';
  }
  requiredSet(id: string) {
    return this.thing()?.fieldSets.some((s) => s.includes.includes(id));
  }
  pinned(pin: Pin) {
    return (
      this.thing()?.pinnedFields.some((p) => JSON.stringify(p) === JSON.stringify(pin)) ?? false
    );
  }
  pin(pin: Pin) {
    const pins = this.thing()?.pinnedFields ?? [];
    this.update({
      pinnedFields: this.pinned(pin)
        ? pins.filter((p) => JSON.stringify(p) !== JSON.stringify(pin))
        : [...pins, pin],
    });
  }
  fieldValue(field: Schema['Field'], setId: string | null, value: Value | null) {
    this.update({ values: [{ fieldSetId: setId, fieldId: field.id, value }] });
    this.newField = '';
  }
  standaloneDefinition() {
    if (this.standaloneCache?.id === this.newField) return this.standaloneCache;
    const f = this.fields().find((f) => f.id === this.newField);
    this.standaloneCache = f
      ? { ...f, value: null, masked: false, origin: null, sourceRefs: [] }
      : null;
    return this.standaloneCache;
  }
  localField(field: Schema['UndefinedField']): Schema['Field'] {
    const cached = this.localCache.get(field);
    if (cached) return cached;
    const result: Schema['Field'] = {
      id: field.id,
      name: field.label,
      description: '',
      keywords: [],
      schema: { type: field.valueType === 'money' ? 'object' : field.valueType },
      uiHint: field.valueType === 'money' ? 'money' : 'text',
      sensitive: field.sensitive,
      value: field.value,
      masked: field.masked,
      origin: field.origin,
      sourceRefs: field.sourceRefs,
    };
    this.localCache.set(field, result);
    return result;
  }
  localChange(field: Schema['UndefinedField'], value: Value | null) {
    if (value === null) this.update({ removeUndefinedFieldIds: [field.id] });
    else
      this.update({
        undefinedFields: [{ id: field.id, label: field.label, sensitive: field.sensitive, value }],
      });
  }
  addLocal() {
    if (this.localLabel.trim()) {
      this.update({
        undefinedFields: [
          { label: this.localLabel.trim(), value: this.localValue, sensitive: this.localSensitive },
        ],
      });
      this.localLabel = '';
      this.localValue = '';
      this.localSensitive = false;
    }
  }
  toggleTag(tag: string) {
    const ids = this.thing()?.tagIds ?? [];
    this.update({ tagIds: ids.includes(tag) ? ids.filter((id) => id !== tag) : [...ids, tag] });
  }
  async addTag() {
    if (!this.newTag.trim()) return;
    await this.perform(async () => {
      const tag = await this.api.client
        .POST('/api/tags', { body: { name: this.newTag } })
        .then(apiData);
      this.tags.update((tags) => [...tags, tag]);
      await this.patch({ tagIds: [...(this.thing()?.tagIds ?? []), tag.id] });
      this.newTag = '';
    });
  }
  async upload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await this.perform(async () => {
      if (file.size > this.config.maxUploadBytes) throw new Error('File exceeds the upload limit');
      const attachment = await this.api.client
        .POST('/api/attachments', {
          body: { file },
          bodySerializer(body) {
            const form = new FormData();
            form.append('file', body.file);
            return form;
          },
        })
        .then(apiData);
      await this.api.client.PUT('/api/attachments/{id}/things/{thingId}', {
        params: { path: { id: attachment.id, thingId: this.id } },
      });
      await this.load();
    });
    input.value = '';
  }
  async loadLibrary() {
    await this.perform(async () => {
      this.library.set(
        (
          await this.api.all((query) =>
            this.api.client.GET('/api/attachments', { params: { query } }),
          )
        ).filter((a) => !a.thingIds.includes(this.id)),
      );
    });
  }
  async link() {
    if (!this.linkId) return;
    await this.perform(async () => {
      await this.api.client.PUT('/api/attachments/{id}/things/{thingId}', {
        params: { path: { id: this.linkId, thingId: this.id } },
      });
      this.linkId = '';
      this.library.set([]);
      await this.load();
    });
  }
  async unlink(id: string) {
    await this.perform(async () => {
      await this.api.client.DELETE('/api/attachments/{id}/things/{thingId}', {
        params: { path: { id, thingId: this.id } },
      });
      await this.load();
    });
  }
  async deleteFile(id: string) {
    await this.perform(async () => {
      await this.api.client.DELETE('/api/attachments/{id}', { params: { path: { id } } });
      this.library.update((list) => list.filter((a) => a.id !== id));
    });
  }
  download(file: Schema['Attachment']) {
    void this.perform(() => this.api.download(file));
  }
  activity(action: ActivityAction) {
    void this.perform(async () => {
      if (action.kind === 'issues')
        await this.api.client.PATCH('/api/issues/{id}', {
          params: { path: { id: action.id } },
          body: action.patch,
        });
      else
        await this.api.client.PATCH('/api/events/{id}', {
          params: { path: { id: action.id } },
          body: action.patch,
        });
      await this.load();
    });
  }
  async remove() {
    await this.perform(async () => {
      await this.api.client.DELETE('/api/things/{id}', { params: { path: { id: this.id } } });
      await this.router.navigate(['/']);
    });
  }
}
