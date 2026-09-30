import { Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Schema } from '../../../../shared/model';
import { Api } from '../../core/services/api.service';
import { apiData } from '../../core/api/api-client';
import { Activity } from '../../components/activity/activity';
import type { ActivityAction } from '../../interfaces/activity.interface';
import { fieldAnchor } from '../../utils/sections.util';
import { formatFieldValue } from '../../utils/field.util';
@Component({
  selector: 'bt-resource-card',
  imports: [RouterLink, Activity],
  templateUrl: './resource-card.html',
  styleUrl: './resource-card.scss',
})
export class ResourceCard {
  card = input.required<Schema['ResourceCard']>();
  private api = inject(Api);
  thing = signal<Schema['Thing'] | null>(null);
  field = signal<Schema['Field'] | null>(null);
  file = signal<Schema['Attachment'] | null>(null);
  events = signal<Schema['Event'][]>([]);
  issues = signal<Schema['Issue'][]>([]);
  purchase = signal<Schema['Purchasable'] | null>(null);
  unavailable = signal(false);
  actionFailed = signal(false);
  busy = signal(false);
  loading = signal(true);
  fieldAnchor = fieldAnchor;
  fieldSetId() {
    const card = this.card();
    return card.type === 'field' ? card.fieldSetId : null;
  }
  formatValue = formatFieldValue;
  constructor() {
    effect(() => {
      const card = this.card();
      void this.load(card);
    });
  }
  async load(card: Schema['ResourceCard']) {
    this.loading.set(true);
    this.unavailable.set(card.available === false);
    this.thing.set(null);
    this.field.set(null);
    this.file.set(null);
    this.events.set([]);
    this.issues.set([]);
    this.purchase.set(null);
    try {
      if (card.available === false) return;
      if (card.type === 'thing' || card.type === 'field') {
        const thing = await this.api.client
          .GET('/api/things/{id}', { params: { path: { id: card.thingId } } })
          .then(apiData);
        if (card !== this.card()) return;
        this.thing.set(thing);
        if (card.type === 'field') {
          const field = (
            card.fieldSetId
              ? thing.fieldSets.find((s) => s.id === card.fieldSetId)?.fields
              : thing.standaloneFields
          )?.find((f) => f.id === card.fieldId);
          this.field.set(field ?? null);
          if (!field) this.unavailable.set(true);
        }
      } else if (card.type === 'attachment')
        this.file.set(
          await this.api.client
            .GET('/api/attachments/{id}', {
              params: { path: { id: card.attachmentId } },
            })
            .then(apiData),
        );
      else if (card.type === 'event')
        this.events.set([
          await this.api.client
            .GET('/api/events/{id}', { params: { path: { id: card.eventId } } })
            .then(apiData),
        ]);
      else if (card.type === 'issue')
        this.issues.set([
          await this.api.client
            .GET('/api/issues/{id}', { params: { path: { id: card.issueId } } })
            .then(apiData),
        ]);
      else
        this.purchase.set(
          await this.api.client
            .GET('/api/purchasables/{id}', {
              params: { path: { id: card.purchasableId } },
            })
            .then(apiData),
        );
    } catch {
      this.unavailable.set(true);
    } finally {
      this.loading.set(false);
    }
  }
  async act(action: ActivityAction) {
    this.busy.set(true);
    this.actionFailed.set(false);
    try {
      if (action.kind === 'events')
        await this.api.client.PATCH('/api/events/{id}', {
          params: { path: { id: action.id } },
          body: action.patch,
        });
      else
        await this.api.client.PATCH('/api/issues/{id}', {
          params: { path: { id: action.id } },
          body: action.patch,
        });
      await this.load(this.card());
    } catch {
      this.actionFailed.set(true);
    } finally {
      this.busy.set(false);
    }
  }
  async download() {
    const file = this.file();
    if (!file) return;
    this.actionFailed.set(false);
    try {
      await this.api.download(file);
    } catch {
      this.actionFailed.set(true);
    }
  }
}
