import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { apiClient, apiData } from './app/core/api/api-client';
apiClient
  .GET('/api/config')
  .then(apiData)
  .then((config) => bootstrapApplication(App, appConfig(config)))
  .catch(() => {
    const message = document.getElementById('startup-error');
    if (message) message.hidden = false;
  });
