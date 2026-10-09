import { computed, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withFeature,
  withMethods,
  withProps,
  withState,
} from '@ngrx/signals';
import type { EventRecurrence } from '../../interfaces/event.interface';
import type { MutationResult } from '../../interfaces/state.interface';
import { groupBy } from '../../utils/collection.util';
import { addRecurrence, dayKey } from '../../utils/date.util';
import { isTaskEvent, mockTask } from '../mocks/tasks.mock';
import { EventsStore } from './events.store';
import { withSession } from './with-load';

interface TasksState {
  /** Recurrences changed this session, by task ID; `null` makes a task one-off. */
  _intervals: Record<string, EventRecurrence | null>;
  /** Next occurrence created by completing a recurring task, by the completed task's ID. */
  _generated: Record<string, string>;
}

/**
 * Tasks the owner does for their Things. Until #100, Tasks are date-only Events read and written
 * through `EventsStore` and completed by the tasks mock; recurrence changes last for the session.
 */
export const TasksStore = signalStore(
  { providedIn: 'root' },

  withState<TasksState>({ _intervals: {}, _generated: {} }),

  withProps(() => ({ _events: inject(EventsStore) })),

  withComputed((store) => {
    const entities = computed(() =>
      store._events
        .entities()
        .filter(isTaskEvent)
        .flatMap((event) => mockTask(event, store._intervals()) ?? []),
    );

    return {
      entities,
      entityMap: computed(() => Object.fromEntries(entities().map((task) => [task.id, task]))),
      tasksByThing: computed(() => groupBy(entities(), (task) => task.thingId)),
      status: computed(() => store._events.status()),
      error: computed(() => store._events.error()),
    };
  }),

  withMethods((store) => ({
    ensureLoaded: () => store._events.ensureLoaded(),

    reload: () => store._events.reload(),

    /** Completes a task; a recurring task also gets its next occurrence. */
    async complete(id: string): Promise<MutationResult<unknown>> {
      const task = store.entityMap()[id];
      const result = await store._events.update(id, { status: 'COMPLETED' }, 'completeTask');

      if (!result.ok || !task?.recurrence || !task.scheduledOn) return result;

      const today = dayKey(new Date());
      const from = task.scheduledOn > today ? task.scheduledOn : today;
      const next = await store._events.create({
        thingId: task.thingId,
        issueId: task.issueId,
        title: task.title,
        description: task.description,
        status: 'SCHEDULED',
        startsOn: addRecurrence(from, task.recurrence),
      });

      if (next.ok)
        patchState(store, {
          _generated: { ...store._generated(), [id]: next.value.id },
          _intervals:
            id in store._intervals()
              ? { ...store._intervals(), [next.value.id]: store._intervals()[id] }
              : store._intervals(),
        });
      return next;
    },

    /** Reopens a completed task and removes the occurrence completing it created, if unchanged. */
    async reopen(id: string): Promise<MutationResult<unknown>> {
      const task = store.entityMap()[id];
      const result = await store._events.update(
        id,
        { status: 'SCHEDULED', startsOn: task?.scheduledOn ?? null, startsAt: null },
        'reopenTask',
      );
      const generatedId = store._generated()[id];
      const generated = generatedId ? store.entityMap()[generatedId] : undefined;

      if (!result.ok || !generated) return result;

      patchState(store, {
        _generated: Object.fromEntries(
          Object.entries(store._generated()).filter(([completed]) => completed !== id),
        ),
      });
      if (generated.status !== 'SCHEDULED') return result;
      return store._events.update(
        generated.id,
        { status: 'DISMISSED', startsOn: null, startsAt: null },
        'reopenTask',
      );
    },

    /** Adds a suggested task to the schedule. Until #100 picks the day, it is scheduled for today. */
    add: (id: string) =>
      store._events.update(
        id,
        { status: 'SCHEDULED', startsOn: dayKey(new Date()), startsAt: null },
        'addTask',
      ),

    /** Moves a task to another day and sets or clears its recurrence. */
    async reschedule(id: string, scheduledOn: string, recurrence: EventRecurrence | null) {
      const previous = store._intervals();

      patchState(store, { _intervals: { ...previous, [id]: recurrence } });

      const result = await store._events.update(
        id,
        { status: 'SCHEDULED', startsOn: scheduledOn, startsAt: null },
        'rescheduleTask',
      );

      if (!result.ok) patchState(store, { _intervals: previous });
      return result;
    },

    /** Takes a task off the schedule and returns it to the Thing's suggestions. */
    unschedule: (id: string) =>
      store._events.update(
        id,
        { status: 'SUGGESTED', startsOn: null, startsAt: null },
        'unscheduleTask',
      ),

    _reset: () => patchState(store, { _intervals: {}, _generated: {} }),
  })),

  withFeature((store) => withSession(store._reset)),
);
