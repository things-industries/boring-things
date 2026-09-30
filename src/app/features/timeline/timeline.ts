import { Component } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { navTimeline } from '../../core/app-icons';
import { PlaceholderPage } from '../../components/placeholder-page/placeholder-page';
import { TermPipe } from '../../pipes/term.pipe';
@Component({
  selector: 'bt-timeline',
  imports: [PlaceholderPage, TermPipe],
  viewProviders: [provideIcons({ navTimeline })],
  templateUrl: './timeline.html',
})
export class TimelinePage {}
