import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import LogtoClient from '@logto/browser';
import type { Schema } from '../shared/model';
export const CONFIG = new InjectionToken<Schema['Config']>('runtime configuration');
export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.';
@Injectable({ providedIn: 'root' })
export class Auth {
  readonly config = inject(CONFIG);
  readonly signedIn = signal(false);
  readonly error = signal('');
  private client =
    this.config.logtoEndpoint && this.config.logtoAppId
      ? new LogtoClient({
          endpoint: this.config.logtoEndpoint,
          appId: this.config.logtoAppId,
          resources: [this.config.apiResource],
          scopes: ['profile'],
        })
      : undefined;
  async initialize() {
    try {
      if (!this.client) return;
      if (location.pathname === '/callback') {
        if (await this.client.isSignInRedirected(location.href))
          await this.client.handleSignInCallback(location.href);
        history.replaceState(null, '', '/');
      }
      this.signedIn.set(await this.client.isAuthenticated());
    } catch (error) {
      this.error.set(errorText(error));
    }
  }
  async signIn() {
    try {
      await this.client?.signIn({ redirectUri: location.origin + '/callback' });
    } catch (error) {
      this.error.set(errorText(error));
    }
  }
  async signOut() {
    try {
      this.signedIn.set(false);
      await this.client?.signOut(location.origin + '/');
    } catch (error) {
      this.error.set(errorText(error));
    }
  }
  async token() {
    if (!this.client) throw new Error('Sign in is not configured');
    return this.client.getAccessToken(this.config.apiResource);
  }
}
export const authenticated: CanActivateFn = () =>
  inject(Auth).signedIn() || inject(Router).createUrlTree(['/login']);
@Injectable({ providedIn: 'root' })
export class Api {
  private auth = inject(Auth);
  private router = inject(Router);
  async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const token = await this.auth.token();
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (body !== undefined && !(body instanceof FormData))
      headers['Content-Type'] = 'application/json';
    const response = await fetch('/api' + path, {
      method,
      headers,
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
    if (!response.ok) {
      const problem = await response.json().catch(() => ({ message: 'Request failed' }));
      if (response.status === 401) {
        this.auth.signedIn.set(false);
        void this.router.navigate(['/login']);
      }
      throw new Error(problem.message);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }
  async all<T>(path: string): Promise<T[]> {
    const result: T[] = [];
    let cursor: string | null = null;
    do {
      const query: string =
        path +
        (path.includes('?') ? '&' : '?') +
        'limit=100' +
        (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
      const page: { items: T[]; nextCursor: string | null } = await this.request<{
        items: T[];
        nextCursor: string | null;
      }>(query);
      result.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    return result;
  }
  async blob(id: string) {
    const response = await fetch(`/api/attachments/${id}/content`, {
      headers: { Authorization: `Bearer ${await this.auth.token()}` },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Could not download attachment');
    return response.blob();
  }
  async download(file: Schema['Attachment']) {
    const url = URL.createObjectURL(await this.blob(file.id));
    const link = document.createElement('a');
    link.href = url;
    link.download = file.filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
