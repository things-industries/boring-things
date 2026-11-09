import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TasksStore } from '../../../core/state/tasks.store';
import { createClock } from '../../../core/state/clock';
import { agendaView, loadAgenda } from '../../../core/state/views/agenda.view';
import { Agenda } from '../../../components/agenda/agenda';
import { AgendaSkeleton } from '../../../components/agenda-skeleton/agenda-skeleton';
import { ErrorMessage } from '../../../components/error-message/error-message';
import { ScrollContainer } from '../../../components/scroll-container/scroll-container';
import { TopBar } from '../../../components/top-bar/top-bar';
import { routeThing } from '../thing-loader';

/** One Thing's tasks, appointments and dates by day, with every later day shown. */
@Component({
  selector: 'bt-thing-tasks',
  imports: [RouterLink, Agenda, AgendaSkeleton, ErrorMessage, ScrollContainer, TopBar],
  templateUrl: './thing-tasks.page.html',
  styleUrl: './thing-tasks.page.scss',
})
export class ThingTasksPage {
  private tasks = inject(TasksStore);
  private current = routeThing();
  private collections = loadAgenda();

  readonly id = this.current.id;
  readonly thing = this.current.thing;
  readonly missing = this.current.missing;
  readonly now = createClock();
  readonly agenda = agendaView(this.now, this.id);
  readonly loaded = computed(() => this.current.loaded() && this.collections.loaded());
  readonly error = computed(() => this.current.error() ?? this.collections.error());

  readonly suggestions = computed(
    () =>
      (this.tasks.tasksByThing()[this.id()] ?? []).filter((task) => task.status === 'SUGGESTED')
        .length,
  );

  retry() {
    this.current.retry();
    this.collections.retry();
  }
}
