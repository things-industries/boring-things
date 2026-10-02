import { Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import {
  askQuestion,
  issueFault,
  issueOther,
  issueRenewal,
  issueWarranty,
  openProfile,
} from '../../core/app-icons';
import { APP_CONFIG } from '../../core/app.config';
import { mockIssueKinds } from '../../core/mocks/issue-kind.mock';
import { CONFIG } from '../../core/runtime-config';
import { CategoriesStore } from '../../core/state/categories.store';
import { EventsStore } from '../../core/state/events.store';
import { IssuesStore } from '../../core/state/issues.store';
import { ProfileStore } from '../../core/state/profile.store';
import { ThingsStore } from '../../core/state/things.store';
import { loadCollections } from '../../core/state/load-collections';
import { categoriesView } from '../../core/state/views/categories.view';
import { upcomingEventsView } from '../../core/state/views/events.view';
import { CardGroup } from '../../components/card-group/card-group';
import { CategoryChip } from '../../components/category-chip/category-chip';
import { ErrorMessage } from '../../components/error-message/error-message';
import { EventCard } from '../../components/event-card/event-card';
import { IconButton } from '../../components/icon-button/icon-button';
import { ListRow } from '../../components/list-row/list-row';
import { PromoCard } from '../../components/promo-card/promo-card';
import { SectionHeader } from '../../components/section-header/section-header';
import { ThingRow } from '../../components/thing-row/thing-row';
import { RelativeTimePipe } from '../../pipes/relative-time.pipe';
import { TermPipe } from '../../pipes/term.pipe';
import { daysUntil } from '../../utils/date.util';
import { issueBadges } from '../../utils/issue.util';
import { HomeSkeleton } from './home-skeleton';

@Component({
  selector: 'bt-home',
  imports: [
    DatePipe,
    RouterLink,
    CardGroup,
    CategoryChip,
    ErrorMessage,
    EventCard,
    HomeSkeleton,
    IconButton,
    ListRow,
    PromoCard,
    RelativeTimePipe,
    SectionHeader,
    TermPipe,
    ThingRow,
  ],
  viewProviders: [
    provideIcons({ askQuestion, issueFault, issueOther, issueRenewal, issueWarranty, openProfile }),
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class HomePage {
  private profileStore = inject(ProfileStore);
  private categoriesStore = inject(CategoriesStore);
  private thingsStore = inject(ThingsStore);
  private issuesStore = inject(IssuesStore);
  private eventsStore = inject(EventsStore);
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
  private readonly upcomingEvents = upcomingEventsView();
  readonly upcoming = computed(() => this.upcomingEvents()[0] ?? null);
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

  readonly loaded = this.collections.loaded;
  readonly error = this.collections.error;

  readonly issuesFailed = computed(() => this.issuesStore.status() === 'error');
  readonly thingsFailed = computed(() => this.thingsStore.status() === 'error');
  readonly categoriesFailed = computed(() => this.categoriesStore.status() === 'error');
  readonly upcomingFailed = computed(
    () => this.eventsStore.status() === 'error' || this.thingsFailed(),
  );

  retry() {
    this.collections.retry();
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
