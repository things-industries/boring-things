import { Injectable, inject, signal } from '@angular/core';
import LogtoClient from '@logto/browser';
import { Subject } from 'rxjs';
import { CONFIG } from '../runtime-config';
import type { UiErrorCode } from '../../interfaces/error.interface';
import { UiError } from '../../utils/error.util';
@Injectable({ providedIn: 'root' })
export class Auth {
  readonly config = inject(CONFIG);
  private readonly signedInState = signal(false);
  readonly signedIn = this.signedInState.asReadonly();
  private readonly sessionChanges = new Subject<boolean>();
  /** Emits the new signed-in state each time it changes. */
  readonly sessionChanged = this.sessionChanges.asObservable();
  private readonly errorState = signal<UiErrorCode | null>(null);
  readonly error = this.errorState.asReadonly();
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
      this.setSignedIn(await this.client.isAuthenticated());
    } catch {
      this.errorState.set('auth-failed');
    }
  }
  async signIn() {
    try {
      await this.client?.signIn({ redirectUri: location.origin + '/callback' });
    } catch {
      this.errorState.set('auth-failed');
    }
  }
  async signOut() {
    try {
      this.setSignedIn(false);
      await this.client?.signOut(location.origin + '/');
    } catch {
      this.errorState.set('auth-failed');
    }
  }
  expireSession() {
    this.setSignedIn(false);
  }
  private setSignedIn(value: boolean) {
    if (this.signedInState() === value) return;
    this.signedInState.set(value);
    this.sessionChanges.next(value);
  }
  async token() {
    if (!this.client) throw new UiError('auth-failed');
    return this.client.getAccessToken(this.config.apiResource);
  }
}
