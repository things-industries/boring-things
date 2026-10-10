// Mock for #100: sample tasks and appointments with completion actions. Remove when #100 is delivered.
import { Injectable, inject } from '@angular/core';
import { addDays, set } from 'date-fns';
import type { Schema } from '../../../../shared/model';
import { dayKey } from '../../utils/date.util';
import { IssuesService } from '../data/issues.service';
import { ThingsService } from '../data/things.service';

type SampleFields = Pick<
  Schema['Event'],
  'title' | 'description' | 'status' | 'startsAt' | 'startsOn'
>;

interface Sample {
  key: string;
  /** Added to the first sample Thing in this category. */
  categoryId: string;
  /** Links the Thing's first open issue. */
  aboutIssue?: boolean;
  fields(now: Date): SampleFields;
}

const at = (now: Date, days: number, hours: number, minutes = 0) =>
  set(addDays(now, days), { hours, minutes, seconds: 0, milliseconds: 0 }).toISOString();

const on = (now: Date, days: number) => dayKey(addDays(now, days));

/** Titles and descriptions match the completion action rules in `tasks.mock.ts`. */
const samples: Sample[] = [
  {
    key: 'engineer-visit',
    categoryId: 'appliances',
    aboutIssue: true,
    fields: (now) => ({
      title: 'Engineer visit',
      description: 'Sample appointment to look at the fault.',
      status: 'SCHEDULED',
      startsAt: at(now, 0, 9),
      startsOn: null,
    }),
  },
  {
    key: 'deep-clean',
    categoryId: 'appliances',
    fields: (now) => ({
      title: 'Deep clean',
      description: 'Sample task. Every 1 month.',
      status: 'SCHEDULED',
      startsAt: null,
      startsOn: on(now, 1),
    }),
  },
  {
    key: 'mechanic',
    categoryId: 'vehicles',
    fields: (now) => ({
      title: 'Annual service at the mechanic',
      description: 'Sample appointment.',
      status: 'COMPLETED',
      startsAt: at(now, 0, 8, 30),
      startsOn: null,
    }),
  },
  {
    key: 'mot',
    categoryId: 'vehicles',
    fields: (now) => ({
      title: 'MOT test',
      description: 'Sample task. Every 12 months.',
      status: 'SCHEDULED',
      startsAt: null,
      startsOn: on(now, 6),
    }),
  },
  {
    key: 'renew-policy',
    categoryId: 'insurance',
    fields: (now) => ({
      title: 'Renew the policy',
      description: 'Sample task. Every 12 months.',
      status: 'SCHEDULED',
      startsAt: null,
      startsOn: on(now, 0),
    }),
  },
  {
    key: 'renew-membership',
    categoryId: 'memberships',
    fields: (now) => ({
      title: 'Renew the membership',
      description: 'Sample task. Every 1 year.',
      status: 'SCHEDULED',
      startsAt: null,
      startsOn: on(now, 2),
    }),
  },
];

/**
 * Sample tasks and appointments on the owner's sample Things, so completion actions can be tried
 * before #100. `EventsService` lists them with the stored Events and sends their changes here; they
 * last for the session. A created Event with a sample's Thing and title, such as the next
 * occurrence of a recurring sample, is kept here too.
 */
@Injectable({ providedIn: 'root' })
export class MockSampleEvents {
  private things = inject(ThingsService);
  private issues = inject(IssuesService);
  /** By sample key and Thing ID. */
  private created = new Set<string>();
  private events = new Map<string, Schema['Event']>();

  /** The stored Events followed by the samples for the owner's sample Things. */
  async withSamples(stored: Schema['Event'][]): Promise<Schema['Event'][]> {
    const [things, issues] = await Promise.all([
      this.things.list().catch(() => []),
      this.issues.list().catch(() => []),
    ]);
    const now = new Date();

    for (const sample of samples) {
      const thing = things.find((t) => t.isSample && t.categoryId === sample.categoryId);
      const key = `${sample.key}:${thing?.id}`;

      if (!thing || this.created.has(key)) continue;

      const fields = sample.fields(now);
      const issue = sample.aboutIssue
        ? issues.find((i) => i.thingId === thing.id && i.status === 'OPEN')
        : undefined;
      const id = crypto.randomUUID();

      this.created.add(key);
      this.events.set(id, {
        ...fields,
        id,
        thingId: thing.id,
        issueId: issue?.id ?? null,
        completedAt: fields.status === 'COMPLETED' ? now.toISOString() : null,
        sourceRefs: [],
        isSample: true,
      });
    }

    const thingIds = new Set(things.map((thing) => thing.id));

    return [...stored, ...[...this.events.values()].filter((e) => thingIds.has(e.thingId))];
  }

  /** The sample with this ID, if it is one. */
  get(id: string): Schema['Event'] | undefined {
    return this.events.get(id);
  }

  /** Creates the Event here when it repeats a sample, or returns `undefined`. */
  create(input: Schema['EventInput']): Schema['Event'] | undefined {
    const repeats = [...this.events.values()].some(
      (event) => event.thingId === input.thingId && event.title === input.title,
    );

    if (!repeats) return undefined;

    const status = input.status ?? 'SCHEDULED';
    const event: Schema['Event'] = {
      id: input.id ?? crypto.randomUUID(),
      thingId: input.thingId,
      issueId: input.issueId ?? null,
      title: input.title,
      description: input.description ?? '',
      status,
      startsAt: input.startsAt ?? null,
      startsOn: input.startsOn ?? null,
      completedAt: status === 'COMPLETED' ? new Date().toISOString() : null,
      sourceRefs: [],
      isSample: true,
    };

    this.events.set(event.id, event);
    return event;
  }

  /** Applies a patch to the sample with this ID, or returns `undefined` when it is not one. */
  update(id: string, patch: Schema['EventPatch']): Schema['Event'] | undefined {
    const event = this.events.get(id);

    if (!event) return undefined;

    const next = { ...event, ...patch };

    if (patch.status && patch.status !== event.status)
      next.completedAt = patch.status === 'COMPLETED' ? new Date().toISOString() : null;
    this.events.set(id, next);
    return next;
  }
}
