import { Component, inject } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { openProfile } from '../../core/app-icons';
import { Auth } from '../../core/services/auth.service';
import { ProfileStore } from '../../core/state/profile.store';
import { PlaceholderPage } from '../../components/placeholder-page/placeholder-page';
import { TermPipe } from '../../pipes/term.pipe';

@Component({
  selector: 'bt-profile',
  imports: [PlaceholderPage, TermPipe],
  viewProviders: [provideIcons({ openProfile })],
  templateUrl: './profile.page.html',
})
export class ProfilePage {
  readonly auth = inject(Auth);
  readonly profile = inject(ProfileStore).profile;
}
