import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import LogtoClient from '@logto/browser';
import type { Schema } from '../shared/model';
import { allPages, apiData, createApiClient } from './core/api/api-client';
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
  readonly client = createApiClient({
    token: () => this.auth.token(),
    onUnauthorized: () => {
      this.auth.signedIn.set(false);
      void this.router.navigate(['/login']);
    },
  });
  readonly all = allPages;
  async blob(id: string) {
    return this.client
      .GET('/api/attachments/{id}/content', {
        params: { path: { id } },
        parseAs: 'blob',
      })
      .then(apiData);
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
