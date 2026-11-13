/** Sentry exception reporting, HTTP tracing and application metrics for the Fastify process. */

import * as Sentry from '@sentry/node';
import { getSentryOptions } from '../../shared/sentry.js';
import { getEnv } from './config.js';

// Starts Sentry before Fastify creates the application. Langfuse owns OpenTelemetry.
export function initializeSentry() {
  const dsn = getEnv('SENTRY_DSN', { optional: true });
  if (!dsn) return;

  Sentry.init({
    ...getSentryOptions(getEnv('NODE_ENV'), getEnv('RENDER_GIT_COMMIT', { optional: true })),
    dsn,
    beforeSendLog: () => null,
    enableOpenTelemetrySetup: false,
    // Use Sentry's native HTTP instrumentation without automatic database and AI tracing.
    defaultIntegrations: Sentry.getDefaultIntegrationsWithoutPerformance().filter(
      ({ name }) => name !== 'NodeFetch' && name !== 'ContextLines',
    ),
    integrations: [
      Sentry.httpIntegration({
        ignoreIncomingRequests: (path) => !path.startsWith('/api/'),
        ignoreOutgoingRequests: () => true,
        tracePropagation: false,
      }),
      Sentry.fastifyIntegration({ shouldHandleError: () => false }),
    ],
  });
}

// Records request count and timing independently of sampled traces.
export function recordHttpDuration(
  route: string,
  method: string,
  status: number,
  elapsedMs: number,
) {
  Sentry.metrics.distribution('api.request.duration', elapsedMs, {
    unit: 'millisecond',
    attributes: { route, method, status },
  });
}

export const applicationMetrics = Sentry.metrics;
export const isSentryEnabled = Sentry.isEnabled;

// Captures an exception with operational tags, a stack and identifiers for log lookup.
export function captureFailure(
  error: unknown,
  operation: string,
  reason: string,
  correlation?: {
    requestId?: string;
    route?: string;
    jobId?: string;
    attemptId?: string;
    traceId?: string;
  },
) {
  if (!Sentry.isEnabled()) return;
  Sentry.captureException(error instanceof Error ? error : new Error('Operation failed'), {
    tags: { operation, reason },
    fingerprint: ['{{ default }}', operation, reason],
    ...(correlation && { contexts: { correlation } }),
  });
}

// Gives the SDK time to send diagnostics when the server stops.
export async function flushSentry() {
  if (Sentry.isEnabled()) await Sentry.flush(2000);
}
