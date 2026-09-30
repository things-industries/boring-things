import { inject, provideAppInitializer, type ApplicationConfig } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import type { Schema } from '../../shared/model';
import { CONFIG } from './core/runtime-config';
import { Auth } from './core/services/auth.service';
import { routes } from './app.routes';
export function appConfig(config: Schema['Config']): ApplicationConfig {
  return {
    providers: [
      { provide: CONFIG, useValue: config },
      provideAppInitializer(() => inject(Auth).initialize()),
      provideRouter(routes, withInMemoryScrolling({ anchorScrolling: 'enabled' })),
    ],
  };
}
