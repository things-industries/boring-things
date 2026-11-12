/** Sentry error capture, request tracing, and diagnostic logs for the Fastify process. */

import * as Sentry from '@sentry/node';
import { getSentryOptions } from '../../shared/sentry.js';
import { ApplicationError } from './application/errors.js';
import { getEnv } from './config.js';

// Starts Sentry before Fastify creates the application. Langfuse owns OpenTelemetry.
export function initializeSentry() {
  const dsn = getEnv('SENTRY_DSN', { optional: true });
  if (!dsn) return;

  Sentry.init({
    ...getSentryOptions(getEnv('NODE_ENV'), getEnv('RENDER_GIT_COMMIT', { optional: true })),
    dsn,
    enableOpenTelemetrySetup: false,
    // Use Sentry's native HTTP instrumentation without automatic database and AI tracing.
    defaultIntegrations: Sentry.getDefaultIntegrationsWithoutPerformance().filter(
      ({ name }) => name !== 'NodeFetch',
    ),
    integrations: [
      Sentry.httpIntegration({
        ignoreIncomingRequests: (path) => !path.startsWith('/api/'),
        ignoreOutgoingRequests: () => true,
        tracePropagation: false,
      }),
      Sentry.fastifyIntegration({
        shouldHandleError(error, _request, reply) {
          const status = 'statusCode' in error ? error.statusCode : reply.statusCode;
          return (
            !(error instanceof ApplicationError) &&
            !(typeof status === 'number' && status >= 400 && status < 500)
          );
        },
      }),
    ],
  });
}

// Sends an HTTP failure log with a route template and status.
export function logRequestFailure(route: string | undefined, status: number) {
  Sentry.logger.error('Request failed', {
    'http.route': route ?? 'unmatched',
    'http.response.status_code': status,
  });
}

// Captures a background exception with operational tags and the original stack.
export function captureBackgroundFailure(error: unknown, operation: string, reason: string) {
  if (!Sentry.isEnabled()) return;
  Sentry.captureException(error instanceof Error ? error : new Error('Background work failed'), {
    tags: { operation, reason },
    fingerprint: ['{{ default }}', operation, reason],
  });
}

// Gives the SDK time to send diagnostics when the server stops.
export async function flushSentry() {
  if (Sentry.isEnabled()) await Sentry.flush(2000);
}
