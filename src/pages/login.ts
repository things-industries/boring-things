import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../app-services';
@Component({
  selector: 'bt-login',
  imports: [RouterLink],
  template: `
    <section class="login-panel">
      <span class="eyebrow">LESS TO REMEMBER</span>
      <h1>Your things.<br />Your life, organised.</h1>
      <p>
        Keep the details, documents and little jobs that come with the things in your life together.
      </p>
      @if (auth.error()) {
        <p class="error" role="alert">{{ auth.error() }}</p>
      }
      @if (auth.signedIn()) {
        <a class="button" routerLink="/">Open your things</a>
      } @else if (auth.config.logtoEndpoint && auth.config.logtoAppId) {
        <button (click)="auth.signIn()">Sign in or create an account <span>↗</span></button>
      } @else {
        <p class="notice">
          Sign-in setup is pending. The local app is ready for its Logto connection.
        </p>
      }
      <div class="login-examples">
        <span>⌂ Home</span><span>↗ Vehicles</span><span>◉ Memberships</span>
      </div>
    </section>
  `,
})
export class Login {
  readonly auth = inject(Auth);
}
