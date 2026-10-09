import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  agendaEvent,
  agendaThingDate,
  askQuestion,
  issueFault,
  issueOther,
  issueRenewal,
  issueWarranty,
  openProfile,
  openRow,
  taskCritical,
  taskDone,
  taskOpen,
  taskOverdue,
} from '../../core/app-icons';
import { APP_CONFIG } from '../../core/app.config';
import { mockIssueKinds } from '../../core/mocks/issue-kind.mock';
import { CONFIG } from '../../core/runtime-config';
import { CategoriesStore } from '../../core/state/categories.store';
import { EventsStore } from '../../core/state/events.store';
import { TasksStore } from '../../core/state/tasks.store';
import { IssuesStore } from '../../core/state/issues.store';
import { ProfileStore } from '../../core/state/profile.store';
import { ThingsStore } from '../../core/state/things.store';
import { loadCollections } from '../../core/state/load-collections';
import { categoriesView } from '../../core/state/views/categories.view';
import { agendaView, loadAgenda } from '../../core/state/views/agenda.view';
import { CardGroup } from '../../components/card-group/card-group';
import { CategoryChip } from '../../components/category-chip/category-chip';
import { ErrorMessage } from '../../components/error-message/error-message';
import { IconButton } from '../../components/icon-button/icon-button';
import { ListRow } from '../../components/list-row/list-row';
import { PromoCard } from '../../components/promo-card/promo-card';
import { SectionHeader } from '../../components/section-header/section-header';
import { ThingRow } from '../../components/thing-row/thing-row';
import { TermPipe } from '../../pipes/term.pipe';
import { isDone, itemTitle } from '../../utils/agenda.util';
import { daysUntil } from '../../utils/date.util';
import { issueBadges } from '../../utils/issue.util';
import { HomeSkeleton } from './home-skeleton/home-skeleton';

@Component({
  selector: 'bt-home',
  imports: [
    DatePipe,
    RouterLink,
    CardGroup,
    CategoryChip,
    ErrorMessage,
    HomeSkeleton,
    IconButton,
    ListRow,
    NgIcon,
    PromoCard,
    SectionHeader,
    TermPipe,
    ThingRow,
  ],
  viewProviders: [
    provideIcons({
      agendaEvent,
      agendaThingDate,
      askQuestion,
      issueFault,
      issueOther,
      issueRenewal,
      issueWarranty,
      openProfile,
      openRow,
      taskCritical,
      taskDone,
      taskOpen,
      taskOverdue,
    }),
  ],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage {
  private profileStore = inject(ProfileStore);
  private categoriesStore = inject(CategoriesStore);
  private thingsStore = inject(ThingsStore);
  private issuesStore = inject(IssuesStore);
  private eventsStore = inject(EventsStore);
  private tasksStore = inject(TasksStore);
  private agendaCollections = loadAgenda();
  private collections = loadCollections(
    this.profileStore,
    this.categoriesStore,
    this.thingsStore,
    this.issuesStore,
    this.eventsStore,
  );

  readonly config = inject(CONFIG);
  readonly daysUntil = daysUntil;
  readonly issueBadges = issueBadges;

  readonly period = dayPeriod(new Date());
  readonly profile = this.profileStore.profile;
  readonly seeding = this.profileStore.seeding;
  readonly categories = categoriesView();
  private readonly agenda = agendaView(signal(new Date()));

  /** Today's items in agenda order: how many are left and overdue, and the first few. */
  readonly today = computed(() => {
    const items = this.agenda().today;
    const open = items.filter((item) => !isDone(item));

    return {
      total: items.length,
      left: open.length,
      overdue: open.filter((item) => item.overdue).length,
      shown: items.slice(0, APP_CONFIG.todaySummaryLimit),
      more: Math.max(0, items.length - APP_CONFIG.todaySummaryLimit),
    };
  });

  readonly isDone = isDone;
  readonly itemTitle = itemTitle;
  readonly issues = computed(() =>
    mockIssueKinds(this.issuesStore.openIssues()).slice(0, APP_CONFIG.activityLimit),
  );

  readonly things = computed(() =>
    [...this.thingsStore.entities()]
      .sort(
        (a, b) =>
          (b.lastViewedAt ?? '').localeCompare(a.lastViewedAt ?? '') || a.id.localeCompare(b.id),
      )
      .slice(0, APP_CONFIG.recentThingLimit),
  );

  readonly loaded = computed(() => this.collections.loaded() && this.agendaCollections.loaded());

  readonly error = computed(() => this.collections.error() ?? this.agendaCollections.error());

  readonly issuesFailed = computed(() => this.issuesStore.status() === 'error');
  readonly thingsFailed = computed(() => this.thingsStore.status() === 'error');
  readonly categoriesFailed = computed(() => this.categoriesStore.status() === 'error');
  readonly todayFailed = computed(
    () => this.tasksStore.status() === 'error' || this.thingsFailed(),
  );

  retry() {
    this.collections.retry();
    this.agendaCollections.retry();
  }

  category(id: string) {
    return this.categories().find((c) => c.id === id);
  }

  samples() {
    void this.profileStore.seedSamples();
  }
}

function dayPeriod(now: Date): 'morning' | 'afternoon' | 'evening' {
  const hour = now.getHours();

  if (hour < 12) return 'morning';
  return hour < 18 ? 'afternoon' : 'evening';
}
