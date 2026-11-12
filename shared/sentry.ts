/** Sentry defaults and data filtering shared by the browser and server SDKs. */

const spanAttributes = new Set([
  'http.request.method',
  'http.response.status_code',
  'http.route',
  'sentry.environment',
  'sentry.exclusive_time',
  'sentry.kind',
  'sentry.op',
  'sentry.origin',
  'sentry.platform',
  'sentry.release',
  'sentry.sample_rate',
  'sentry.sdk.name',
  'sentry.sdk.version',
  'sentry.segment.name.source',
]);

// Removes query parameters, fragments and record IDs from diagnostic names.
function scrubName(name: string) {
  return name
    .replace(/[?#].*$/, '')
    .replace(/\b[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}\b/gi, ':id');
}

// Supplies SDK options for collecting errors and traces without request content.
export function getSentryOptions(environment: string, release?: string) {
  return {
    environment,
    release,
    tracesSampleRate: environment === 'production' ? 0.1 : 1,
    enableLogs: true,
    maxBreadcrumbs: 0,
    dataCollection: {
      cookies: false,
      httpBodies: [],
      httpHeaders: false,
      stackFrameVariables: false,
      urlQueryParams: false,
      userInfo: false,
    },
    beforeSend: scrubEvent,
    beforeSendSpan: scrubSpan,
  };
}

// Keeps stack traces and removes raw request context and serialized thrown objects.
function scrubEvent<
  T extends { request?: unknown; user?: unknown; extra?: unknown; transaction?: string },
>(event: T) {
  delete event.request;
  delete event.user;
  delete event.extra;
  if (event.transaction) event.transaction = scrubName(event.transaction);
  return event;
}

// Keeps operation, route and status attributes and removes raw URLs and exception attributes.
function scrubSpan<T extends { name: string; attributes: Record<string, unknown> }>(span: T) {
  span.name = scrubName(span.name);
  span.attributes = Object.fromEntries(
    Object.entries(span.attributes).filter(([key]) => spanAttributes.has(key)),
  );
  if (typeof span.attributes['http.route'] === 'string')
    span.attributes['http.route'] = scrubName(span.attributes['http.route']);
  return span;
}
