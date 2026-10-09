import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TasksStore } from '../../../core/state/tasks.store';
import { loadCollections } from '../../../core/state/load-collections';
import { ErrorMessage } from '../../../components/error-message/error-message';
import { ScrollContainer } from '../../../components/scroll-container/scroll-container';
import { SuggestedTask } from '../../../components/suggested-task/suggested-task';
import { TopBar } from '../../../components/top-bar/top-bar';
import { byPriority } from '../../../utils/agenda.util';
import { RowSkeleton } from '../row-skeleton/row-skeleton';
import { routeThing } from '../thing-loader';

/** A Thing's suggested tasks by priority, each ready to add to its tasks. */
@Component({
  selector: 'bt-thing-suggestions',
  imports: [RouterLink, ErrorMessage, RowSkeleton, ScrollContainer, SuggestedTask, TopBar],
  templateUrl: './thing-suggestions.page.html',
  styleUrl: './thing-suggestions.page.scss',
})
export class ThingSuggestionsPage {
  private tasks = inject(TasksStore);
  private current = routeThing();
  private collections = loadCollections(this.tasks);

  readonly id = this.current.id;
  readonly missing = this.current.missing;
  readonly loaded = computed(() => this.current.loaded() && this.collections.loaded());
  readonly error = computed(() => this.current.error() ?? this.collections.error());

  readonly suggested = computed(() =>
    byPriority(
      (this.tasks.tasksByThing()[this.id()] ?? []).filter((task) => task.status === 'SUGGESTED'),
    ),
  );

  retry() {
    this.current.retry();
    this.collections.retry();
  }

  /** Adds a suggested task to the schedule; the day is chosen for the owner. */
  add(id: string) {
    void this.tasks.add(id);
  }
}
