import createClient, { type ClientOptions } from 'openapi-fetch';
import type { paths } from '../../../shared/api';

export function createApiClient(
  auth?: { token: () => Promise<string | undefined>; onUnauthorized: () => void },
  options: ClientOptions = {},
) {
  const client = createClient<paths>({ cache: 'no-store', ...options });
  client.use({
    async onRequest({ request }) {
      if (auth) request.headers.set('Authorization', `Bearer ${await auth.token()}`);
      return request;
    },
    async onResponse({ response }) {
      if (response.ok) return response;
      if (response.status === 401) auth?.onUnauthorized();
      const problem: unknown = await response.json().catch(() => null);
      throw new Error(
        problem &&
          typeof problem === 'object' &&
          'message' in problem &&
          typeof problem.message === 'string'
          ? problem.message
          : 'Request failed',
      );
    },
  });
  return client;
}

export const apiClient = createApiClient();

export function apiData<T>({ data }: { data?: T }): T {
  if (data === undefined) throw new Error('The server returned no data');
  return data;
}

export async function allPages<T>(
  load: (query: { limit: number; cursor?: string }) => Promise<{
    data?: { items: T[]; nextCursor: string | null };
  }>,
): Promise<T[]> {
  const result: T[] = [];
  let cursor: string | undefined;
  do {
    const page = apiData(await load({ limit: 100, cursor }));
    result.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return result;
}
