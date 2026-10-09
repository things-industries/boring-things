import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { openProfile } from '../../core/app-icons';
import { agendaView, loadAgenda } from '../../core/state/views/agenda.view';
import { Agenda } from '../../components/agenda/agenda';
import { AgendaSkeleton } from '../../components/agenda-skeleton/agenda-skeleton';
import { ErrorMessage } from '../../components/error-message/error-message';
import { IconButton } from '../../components/icon-button/icon-button';
import { TermPipe } from '../../pipes/term.pipe';

/** Every Thing's tasks, appointments and dates by day. */
@Component({
  selector: 'bt-tasks',
  imports: [RouterLink, Agenda, AgendaSkeleton, ErrorMessage, IconButton, TermPipe],
  viewProviders: [provideIcons({ openProfile })],
  templateUrl: './tasks.page.html',
  styleUrl: './tasks.page.scss',
})
export class TasksPage {
  private collections = loadAgenda();

  readonly now = signal(new Date());
  readonly agenda = agendaView(this.now);
  readonly loaded = this.collections.loaded;
  readonly error = this.collections.error;

  retry() {
    this.collections.retry();
  }
}
