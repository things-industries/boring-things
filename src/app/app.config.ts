import { inject, provideAppInitializer, type ApplicationConfig } from '@angular/core';
import { provideRouter, withInMemoryScrolling, withRouterConfig } from '@angular/router';
import { provideToastr } from 'ngx-toastr';
import type { Schema } from '../../shared/model';
import { APP_CONFIG } from './core/app.config';
import { CONFIG } from './core/runtime-config';
import { Auth } from './core/services/auth.service';
import { CategoriesStore } from './core/state/categories.store';
import { ProfileStore } from './core/state/profile.store';
import { TagsStore } from './core/state/tags.store';
import { routes } from './app.routes';

export function appConfig(config: Schema['Config']): ApplicationConfig {
  return {
    providers: [
      { provide: CONFIG, useValue: config },
      provideAppInitializer(() => inject(Auth).initialize()),
      // These stores load on sign-in.
      provideAppInitializer(() => {
        inject(ProfileStore);
        inject(CategoriesStore);
        inject(TagsStore);
      }),

      // A cancelled Back keeps the browser history where it was, so a later Back still works.
      provideRouter(
        routes,
        withInMemoryScrolling({ anchorScrolling: 'enabled' }),
        withRouterConfig({ canceledNavigationResolution: 'computed' }),
      ),
      provideToastr({
        positionClass: 'toast-bottom-center',
        timeOut: APP_CONFIG.toastMs,
        maxOpened: APP_CONFIG.toastLimit,
        autoDismiss: true,
        preventDuplicates: true,
        includeTitleDuplicates: true,
        closeButton: true,
        newestOnTop: false,
      }),
    ],
  };
}
