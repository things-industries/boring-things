import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import type { Schema } from '../../../../shared/model';
import { apiData } from '../../core/api/api-client';
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
import { Api } from '../../core/services/api.service';
import { CardGroup } from '../../components/card-group/card-group';
import { CategoryChip } from '../../components/category-chip/category-chip';
import { ErrorMessage } from '../../components/error-message/error-message';
import { EventCard } from '../../components/event-card/event-card';
import { IconButton } from '../../components/icon-button/icon-button';
import { ListRow } from '../../components/list-row/list-row';
import { PromoCard } from '../../components/promo-card/promo-card';
import { SectionHeader } from '../../components/section-header/section-header';
import { ThingRow } from '../../components/thing-row/thing-row';
import type { UiErrorCode } from '../../interfaces/error.interface';
import type { IssueKind, IssueView } from '../../interfaces/issue.interface';
import type { IconBadgeTone } from '../../components/icon-badge/icon-badge';
import { RelativeTimePipe } from '../../pipes/relative-time.pipe';
import { TermPipe } from '../../pipes/term.pipe';
import { daysUntil } from '../../utils/date.util';
import { errorCode } from '../../utils/error.util';
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
  private api = inject(Api);
  readonly config = inject(CONFIG);
  readonly daysUntil = daysUntil;
  readonly kindBadges: Record<IssueKind, { icon: string; tone: IconBadgeTone }> = {
    RENEWAL: { icon: 'issueRenewal', tone: 'info' },
    WARRANTY: { icon: 'issueWarranty', tone: 'accent' },
    FAULT: { icon: 'issueFault', tone: 'warning' },
    OTHER: { icon: 'issueOther', tone: 'neutral' },
  };
  readonly period = dayPeriod(new Date());
  profile = signal<Schema['Profile'] | null>(null);
  categories = signal<Schema['Category'][]>([]);
  issues = signal<IssueView[]>([]);
  upcoming = signal<Schema['Event'] | null>(null);
  upcomingThing = signal('');
  things = signal<Schema['ThingSummary'][]>([]);
  loaded = signal(false);
  busy = signal(false);
  error = signal<UiErrorCode | null>(null);
  constructor() {
    void this.load();
  }
  async load() {
    this.error.set(null);
    try {
      const [profile, categories, issues, events, things] = await Promise.all([
        this.api.client.GET('/api/profile').then(apiData),
        this.api.all((query) => this.api.client.GET('/api/categories', { params: { query } })),
        this.api.client
          .GET('/api/issues', {
            params: { query: { status: 'OPEN', limit: APP_CONFIG.apiPageSize } },
          })
          .then(apiData),
        this.api.client
          .GET('/api/events', {
            params: {
              query: {
                status: 'SCHEDULED',
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                from: new Date().toISOString(),
                limit: 1,
              },
            },
          })
          .then(apiData),
        this.api.client
          .GET('/api/things', {
            params: { query: { sort: 'RECENTLY_VIEWED', limit: APP_CONFIG.recentThingLimit } },
          })
          .then(apiData),
      ]);
      const upcoming = events.items[0] ?? null;
      this.upcomingThing.set(upcoming ? await this.thingName(upcoming.thingId, things.items) : '');
      this.profile.set(profile);
      this.categories.set(categories);
      this.issues.set(mockIssueKinds(issues.items).slice(0, APP_CONFIG.activityLimit));
      this.upcoming.set(upcoming);
      this.things.set(things.items);
    } catch (e) {
      this.error.set(errorCode(e));
    } finally {
      this.loaded.set(true);
    }
  }
  category(id: string) {
    return this.categories().find((c) => c.id === id);
  }
  async samples() {
    this.busy.set(true);
    try {
      await this.api.client.POST('/api/profile:seed-samples');
      await this.load();
    } catch (e) {
      this.error.set(errorCode(e));
    } finally {
      this.busy.set(false);
    }
  }
  private async thingName(id: string, known: Schema['ThingSummary'][]) {
    const thing = known.find((t) => t.id === id);
    if (thing) return thing.name;
    const loaded = await this.api.client
      .GET('/api/things/{id}', { params: { path: { id } } })
      .then(apiData);
    return loaded.name;
  }
}
function dayPeriod(now: Date): 'morning' | 'afternoon' | 'evening' {
  const hour = now.getHours();
  if (hour < 12) return 'morning';
  return hour < 18 ? 'afternoon' : 'evening';
}
