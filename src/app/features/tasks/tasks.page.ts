import { Component } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { navTasks } from '../../core/app-icons';
import { PlaceholderPage } from '../../components/placeholder-page/placeholder-page';
import { TermPipe } from '../../pipes/term.pipe';
@Component({
  selector: 'bt-tasks',
  imports: [PlaceholderPage, TermPipe],
  viewProviders: [provideIcons({ navTasks })],
  templateUrl: './tasks.page.html',
})
export class TasksPage {}
