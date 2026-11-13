/** Browser Sentry initialization and Angular error and router providers. */

import { ErrorHandler, inject, provideAppInitializer, type ApplicationConfig } from '@angular/core';
import { Router } from '@angular/router';
import * as Sentry from '@sentry/angular';
import type { Schema } from '../../../shared/model';
import { getSentryOptions } from '../../../shared/sentry';

// Configures Sentry before Angular starts and returns its Angular providers.
export function configureSentry(
  config: NonNullable<Schema['Config']['sentry']>,
): ApplicationConfig {
  const apiBase = window.location.origin + '/api/';
  Sentry.init({
    ...getSentryOptions(config.environment, config.release),
    dsn: config.dsn,
    tracePropagationTargets: [/^\/api\//],
    integrations: [
      Sentry.browserTracingIntegration({
        ignoreResourceSpans: ['resource.img', 'resource.other'],
        shouldCreateSpanForRequest: (url) => url.startsWith('/api/') || url.startsWith(apiBase),
      }),
    ],
  });

  return {
    providers: [
      {
        provide: ErrorHandler,
        useValue: Sentry.createErrorHandler({
          extractor(error, extractError) {
            Sentry.logger.error('Angular error');
            return extractError(error);
          },
        }),
      },
      { provide: Sentry.TraceService, deps: [Router] },
      provideAppInitializer(() => {
        inject(Sentry.TraceService);
      }),
    ],
  };
}
