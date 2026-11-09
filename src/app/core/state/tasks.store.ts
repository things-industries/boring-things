/** Persisted Tasks, including successors returned by completion. */

import { computed, inject } from '@angular/core';
import { signalStore, withComputed, withFeature, withMethods, withProps } from '@ngrx/signals';
import type { Task, TaskRecurrence } from '../../interfaces/task.interface';
import { TasksService } from '../data/tasks.service';
import { groupBy } from '../../utils/collection.util';
import { withEntityCollection } from './with-entity-collection';
import { removing, updating } from './optimistic';

export const TasksStore = signalStore(
  { providedIn: 'root' },
  withProps(() => ({ _service: inject(TasksService) })),
  withFeature((store) =>
    withEntityCollection<Task>({
      list: () => store._service.list(),
      get: (id) => store._service.get(id),
    }),
  ),
  withComputed((store) => ({
    tasksByThing: computed(() => groupBy(store.entities(), (task) => task.thingId)),
  })),
  withMethods((store) => ({
    async complete(id: string) {
      const result = await store.mutate('completeTask', [], () =>
        store._service.change(id, 'complete'),
      );
      if (result.ok)
        store.receive([
          result.value.task,
          ...(result.value.nextTask ? [result.value.nextTask] : []),
        ]);
      return result;
    },
    async schedule(id: string) {
      const result = await store.mutate('addTask', [], () => store._service.change(id, 'accept'));
      if (result.ok) store.receive([result.value.task]);
      return result;
    },
    async close(id: string) {
      const result = await store.mutate('saveChanges', [], () =>
        store._service.change(id, 'close'),
      );
      if (result.ok) store.receive([result.value.task]);
      return result;
    },
    reschedule(
      id: string,
      scheduledOn: string | null,
      deadlineOn: string | null,
      recurrence: TaskRecurrence | null,
    ) {
      const patch = { scheduledOn, deadlineOn, recurrence };
      return store.mutate(
        'rescheduleTask',
        [
          store.stage(
            id,
            updating((task) => ({ ...task, ...patch })),
          ),
        ],
        () => store._service.update(id, patch),
        { confirm: (task) => task, refetch: () => store.loadOne(id) },
      );
    },
    remove(id: string) {
      return store.mutate(
        'unscheduleTask',
        [store.stage(id, removing)],
        () => store._service.remove(id),
        { confirm: () => null, refetch: () => store.loadOne(id) },
      );
    },
  })),
);
