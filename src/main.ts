/** Loads public runtime configuration and starts the Angular application. */

import { mergeApplicationConfig } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { apiClient, apiData } from './app/core/api/api-client';
apiClient
  .GET('/api/config')
  .then(apiData)
  .then(async (config) => {
    const application = appConfig(config);
    const sentryConfig = config.sentry;
    const monitoring = sentryConfig
      ? await import('./app/core/sentry')
          .then(({ configureSentry }) => configureSentry(sentryConfig))
          .catch((error: unknown) => console.warn('Could not initialize Sentry', error))
      : undefined;
    return bootstrapApplication(
      App,
      monitoring ? mergeApplicationConfig(application, monitoring) : application,
    );
  })
  .catch(() => {
    const message = document.getElementById('startup-error');
    if (message) message.hidden = false;
  });
