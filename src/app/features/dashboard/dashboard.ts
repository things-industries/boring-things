import { isNewThing } from '../../utils/date.util';
import { DashboardSkeleton } from './dashboard-skeleton';
import { TermPipe } from '../../pipes/term.pipe';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { addThing, categoryIcons, open, openProfile, searchThings } from '../../core/app-icons';
import { categoryIcon } from '../../utils/category.util';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CONFIG } from '../../core/runtime-config';
import { APP_CONFIG } from '../../core/app.config';
import { EventsStore } from '../../core/state/events.store';
import { IssuesStore } from '../../core/state/issues.store';
import { ProfileStore } from '../../core/state/profile.store';
import { TagsStore } from '../../core/state/tags.store';
import { ThingsStore } from '../../core/state/things.store';
import { loadCollections } from '../../core/state/load-collections';
import { categoriesView } from '../../core/state/views/categories.view';
import { upcomingEventsView } from '../../core/state/views/events.view';
import { ErrorMessage } from '../../components/error-message/error-message';
import { Activity } from '../../components/activity/activity';
import { IconButton } from '../../components/icon-button/icon-button';
import type { ActivityAction } from '../../interfaces/activity.interface';

@Component({
  viewProviders: [provideIcons({ addThing, open, openProfile, searchThings, ...categoryIcons })],
  selector: 'bt-dashboard',
  imports: [
    DashboardSkeleton,
    FormsModule,
    RouterLink,
    Activity,
    ErrorMessage,
    NgIcon,
    TermPipe,
    IconButton,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private profileStore = inject(ProfileStore);
  private thingsStore = inject(ThingsStore);
  private tagsStore = inject(TagsStore);
  private issuesStore = inject(IssuesStore);
  private eventsStore = inject(EventsStore);
  private collections = loadCollections(
    this.profileStore,
    this.thingsStore,
    this.tagsStore,
    this.issuesStore,
    this.eventsStore,
  );

  readonly config = inject(CONFIG);
  readonly categoryIcon = categoryIcon;
  readonly categories = categoriesView();
  readonly tags = this.tagsStore.sorted;
  readonly issues = computed(() =>
    this.issuesStore.openIssues().slice(0, APP_CONFIG.activityLimit),
  );

  private readonly upcoming = upcomingEventsView();
  readonly events = computed(() => this.upcoming().slice(0, APP_CONFIG.activityLimit));
  readonly samplesAdded = computed(() => this.profileStore.profile()?.samplesAdded ?? true);
  readonly seeding = this.profileStore.seeding;
  readonly loaded = this.collections.loaded;
  readonly error = this.collections.error;

  readonly thingsFailed = computed(() => this.thingsStore.status() === 'error');

  q = '';
  categoryId = inject(ActivatedRoute).snapshot.queryParamMap.get('categoryId') ?? '';
  tagId = '';
  private filters = signal({ q: '', categoryId: this.categoryId, tagId: '' });
  private limit = signal<number>(APP_CONFIG.thingPageSize);
  private matches = computed(() => {
    const { q, categoryId, tagId } = this.filters();
    const text = q.toLowerCase();

    return this.thingsStore
      .entities()
      .filter(
        (thing) =>
          (!categoryId || thing.categoryId === categoryId) &&
          (!tagId || thing.tagIds.includes(tagId)) &&
          (!text || `${thing.name} ${thing.description}`.toLowerCase().includes(text)),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  });

  readonly things = computed(() => this.matches().slice(0, this.limit()));
  readonly hasMore = computed(() => this.matches().length > this.limit());
  retry() {
    this.collections.retry();
  }

  search() {
    this.filters.set({ q: this.q.trim(), categoryId: this.categoryId, tagId: this.tagId });
    this.limit.set(APP_CONFIG.thingPageSize);
  }

  showMore() {
    this.limit.update((limit) => limit + APP_CONFIG.thingPageSize);
  }

  chooseCategory(id: string) {
    this.categoryId = id;
    this.search();
  }

  isNew(createdAt: string) {
    return isNewThing(createdAt, new Date(), APP_CONFIG.newThingDays);
  }

  category(id: string) {
    return this.categories().find((c) => c.id === id);
  }

  samples() {
    void this.profileStore.seedSamples();
  }

  activity(action: ActivityAction) {
    if (action.kind === 'issues')
      void this.issuesStore.update(
        action.id,
        action.patch,
        action.patch.status === 'RESOLVED' ? 'resolveIssue' : 'saveChanges',
      );
    else
      void this.eventsStore.update(
        action.id,
        action.patch,
        action.patch.status === 'COMPLETED' ? 'completeEvent' : 'scheduleEvent',
      );
  }
}
