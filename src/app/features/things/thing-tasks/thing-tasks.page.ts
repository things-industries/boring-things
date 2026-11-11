import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_CONFIG } from '../../../core/app.config';
import { TasksStore } from '../../../core/state/tasks.store';
import { createClock } from '../../../core/state/clock';
import { agendaView, loadAgenda } from '../../../core/state/views/agenda.view';
import { Agenda } from '../../../components/agenda/agenda';
import { AgendaSkeleton } from '../../../components/agenda-skeleton/agenda-skeleton';
import { ErrorMessage } from '../../../components/error-message/error-message';
import { ScrollContainer } from '../../../components/scroll-container/scroll-container';
import { SectionHeader } from '../../../components/section-header/section-header';
import { SuggestedTask } from '../../../components/suggested-task/suggested-task';
import { TopBar } from '../../../components/top-bar/top-bar';
import { byImportance } from '../../../utils/agenda.util';
import { routeThing } from '../thing-loader';

/** One Thing's suggested tasks, then its tasks, appointments and dates by day, with every later day shown. */
@Component({
  selector: 'bt-thing-tasks',
  imports: [
    RouterLink,
    Agenda,
    AgendaSkeleton,
    ErrorMessage,
    ScrollContainer,
    SectionHeader,
    SuggestedTask,
    TopBar,
  ],
  templateUrl: './thing-tasks.page.html',
  styleUrl: './thing-tasks.page.scss',
})
export class ThingTasksPage {
  private tasks = inject(TasksStore);
  private current = routeThing();
  private collections = loadAgenda();

  readonly id = this.current.id;
  readonly missing = this.current.missing;
  readonly now = createClock();
  readonly agenda = agendaView(this.now, this.id);
  readonly loaded = computed(() => this.current.loaded() && this.collections.loaded());
  readonly error = computed(() => this.current.error() ?? this.collections.error());

  readonly showAllSuggestions = signal(false);

  readonly suggested = computed(() =>
    byImportance(
      (this.tasks.tasksByThing()[this.id()] ?? []).filter((task) => task.status === 'SUGGESTED'),
    ),
  );

  readonly hasMoreSuggestions = computed(
    () => this.suggested().length > APP_CONFIG.thingSuggestionLimit,
  );

  readonly visibleSuggestions = computed(() =>
    this.showAllSuggestions()
      ? this.suggested()
      : this.suggested().slice(0, APP_CONFIG.thingSuggestionLimit),
  );

  retry() {
    this.current.retry();
    this.collections.retry();
  }
}
